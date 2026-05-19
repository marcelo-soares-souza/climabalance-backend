import { pgPool } from "../infrastructure/persistence/postgres/pg-client";
import { bunPasswordHasher } from "../infrastructure/crypto/password";
import { uuidv7 } from "../shared/utils/id";
import { logger } from "../shared/utils/logger";

type SeedUser = {
  email: string;
  roleKey: string;
  locale?: string;
};

const seedUsers: SeedUser[] = [
  { email: "analyst@example.com", roleKey: "analyst" },
  { email: "producer@example.com", roleKey: "producer" },
  { email: "individual@example.com", roleKey: "individual" },
  { email: "legal@example.com", roleKey: "legal_entity" },
];

const password = "12345678";
const defaultLocale = "pt-BR";
const now = new Date();
const passwordHash = await bunPasswordHasher.hash(password);
const client = await pgPool.connect();

try {
  await client.query("BEGIN");
  logger.info("seed.test_users.start", { count: seedUsers.length });

  for (const user of seedUsers) {
    const roleResult = await client.query(
      `SELECT id FROM roles WHERE role_key = $1 AND deleted_at IS NULL`,
      [user.roleKey],
    );
    if (!roleResult.rowCount) {
      throw new Error(`Role not found: ${user.roleKey}`);
    }

    const roleId = roleResult.rows[0].id as string;

    const existingUser = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [user.email],
    );

    let userId: string;
    if (existingUser.rowCount) {
      userId = existingUser.rows[0].id as string;
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             status = 'active',
             locale = $2,
             email_confirmed_at = $3,
             deleted_at = NULL,
             updated_at = $3
         WHERE id = $4`,
        [passwordHash, user.locale ?? defaultLocale, now, userId],
      );
    } else {
      userId = uuidv7();
      await client.query(
        `INSERT INTO users (id, email, password_hash, status, locale, email_confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $6)`,
        [
          userId,
          user.email,
          passwordHash,
          user.locale ?? defaultLocale,
          now,
          now,
        ],
      );
    }

    const userRole = await client.query(
      `SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL`,
      [userId, roleId],
    );
    if (!userRole.rowCount) {
      await client.query(
        `INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)`,
        [uuidv7(), userId, roleId, now],
      );
    }

    logger.info("seed.test_users.processed", {
      email: user.email,
      role: user.roleKey,
    });
  }

  await client.query("COMMIT");
  logger.info("seed.test_users.completed");
} catch (error) {
  await client.query("ROLLBACK");
  logger.error("seed.test_users.failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  throw error;
} finally {
  client.release();
  await pgPool.end();
}
