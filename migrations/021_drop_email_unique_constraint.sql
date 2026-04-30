-- Drop the full UNIQUE constraint on users.email so soft-deleted records
-- do not block re-registration with the same email.
-- Replace with a partial unique index that only applies to active records.

ALTER TABLE users DROP CONSTRAINT users_email_key;
CREATE UNIQUE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
