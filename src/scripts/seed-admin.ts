import { pgPool } from "../infrastructure/persistence/postgres/pg-client";
import { bunPasswordHasher } from "../infrastructure/crypto/password";
import { uuidv7 } from "../shared/utils/id";
import { slugify } from "../shared/utils/slugify";
import { optionalEnv, requiredEnv } from "../shared/utils/env";
import { logger } from "../shared/utils/logger";

const adminEmail = optionalEnv("ADMIN_EMAIL") ?? "admin@example.com";
const adminPassword = requiredEnv("ADMIN_PASSWORD");
const adminLocale = optionalEnv("ADMIN_LOCALE") ?? "pt-BR";
const adminSlug = slugify(adminEmail.split("@")[0]);

const now = new Date();
const passwordHash = await bunPasswordHasher.hash(adminPassword);

const client = await pgPool.connect();

try {
  await client.query("BEGIN");
  logger.info("seed.admin.start", { email: adminEmail });

  const roleResult = await client.query(
    `SELECT id FROM roles WHERE role_key = $1 AND deleted_at IS NULL`,
    ["administrator"],
  );

  let roleId: string;
  if (roleResult.rowCount && roleResult.rowCount > 0) {
    roleId = roleResult.rows[0].id as string;
  } else {
    roleId = uuidv7();
    await client.query(
      `INSERT INTO roles (id, role_key, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [
        roleId,
        "administrator",
        "Administrator",
        "System administrator with full access.",
        now,
      ],
    );
  }

  const userResult = await client.query(
    `SELECT id FROM users WHERE email = $1`,
    [adminEmail],
  );

  let userId: string;
  if (userResult.rowCount && userResult.rowCount > 0) {
    userId = userResult.rows[0].id as string;
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           status = 'active',
           locale = $2,
           slug = COALESCE(slug, $3),
           email_confirmed_at = $4,
           deleted_at = NULL,
           updated_at = $4
       WHERE id = $5`,
      [passwordHash, adminLocale, adminSlug, now, userId],
    );
  } else {
    userId = uuidv7();
    await client.query(
      `INSERT INTO users (id, email, password_hash, slug, status, locale, email_confirmed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [
        userId,
        adminEmail,
        passwordHash,
        adminSlug,
        "active",
        adminLocale,
        now,
        now,
      ],
    );
  }

  const userRoleResult = await client.query(
    `SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL`,
    [userId, roleId],
  );

  if (!userRoleResult.rowCount || userRoleResult.rowCount === 0) {
    await client.query(
      `INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [uuidv7(), userId, roleId, now],
    );
  }

  await client.query("COMMIT");
  logger.info("seed.admin.completed", { email: adminEmail, user_id: userId });
} catch (error) {
  await client.query("ROLLBACK");
  logger.error("seed.admin.failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  throw error;
} finally {
  client.release();
  await pgPool.end();
}
