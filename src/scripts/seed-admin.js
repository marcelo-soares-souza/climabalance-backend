import { pgPool } from '../infrastructure/persistence/postgres/pg-client';
import { bunPasswordHasher } from '../infrastructure/crypto/password';
import { uuidv7 } from '../shared/utils/id';
import { logger } from '../shared/utils/logger';
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD;
const adminLocale = process.env.ADMIN_LOCALE ?? 'pt-BR';
if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD is required');
}
const now = new Date();
const passwordHash = await bunPasswordHasher.hash(adminPassword);
const client = await pgPool.connect();
try {
    await client.query('BEGIN');
    logger.info('seed.admin.start', { email: adminEmail });
    const roleResult = await client.query(`SELECT id FROM roles WHERE role_key = $1 AND deleted_at IS NULL`, ['administrator']);
    let roleId;
    if (roleResult.rowCount && roleResult.rowCount > 0) {
        roleId = roleResult.rows[0].id;
    }
    else {
        roleId = uuidv7();
        await client.query(`INSERT INTO roles (id, role_key, name, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)`, [roleId, 'administrator', 'Administrator', 'System administrator with full access.', now]);
    }
    const userResult = await client.query(`SELECT id FROM users WHERE email = $1`, [adminEmail]);
    let userId;
    if (userResult.rowCount && userResult.rowCount > 0) {
        userId = userResult.rows[0].id;
        await client.query(`UPDATE users
       SET password_hash = $1,
           status = 'active',
           locale = $2,
           email_confirmed_at = $3,
           deleted_at = NULL,
           updated_at = $3
       WHERE id = $4`, [passwordHash, adminLocale, now, userId]);
    }
    else {
        userId = uuidv7();
        await client.query(`INSERT INTO users (id, email, password_hash, status, locale, email_confirmed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, [userId, adminEmail, passwordHash, 'active', adminLocale, now, now]);
    }
    const userRoleResult = await client.query(`SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL`, [userId, roleId]);
    if (!userRoleResult.rowCount || userRoleResult.rowCount === 0) {
        await client.query(`INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`, [uuidv7(), userId, roleId, now]);
    }
    await client.query('COMMIT');
    logger.info('seed.admin.completed', { email: adminEmail, user_id: userId });
}
catch (error) {
    await client.query('ROLLBACK');
    logger.error('seed.admin.failed', { error: error instanceof Error ? error.message : 'unknown' });
    throw error;
}
finally {
    client.release();
    await pgPool.end();
}
