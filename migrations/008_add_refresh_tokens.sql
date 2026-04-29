-- Refresh tokens for session renewal without re-authentication.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  fingerprint_hash VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='refresh_tokens' AND column_name='fingerprint_hash') THEN
    ALTER TABLE refresh_tokens ADD COLUMN fingerprint_hash VARCHAR(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='refresh_tokens' AND column_name='user_agent') THEN
    ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT;
  END IF;
END $$;
