-- GDPR / LGPD: User consent tracking for privacy policy and terms of use
-- Stores explicit consent records with version tracking

CREATE TABLE IF NOT EXISTS user_consents (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  consent_type VARCHAR(50) NOT NULL,
  consented BOOLEAN NOT NULL,
  version VARCHAR(20),
  ip_address VARCHAR(45),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_type ON user_consents(consent_type);

-- Subject access / privacy requests tracking
CREATE TABLE IF NOT EXISTS subject_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  request_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  details TEXT,
  resolution_notes TEXT,
  resolved_by_user_id VARCHAR(36),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CHECK (request_type IN ('access', 'rectification', 'erasure', 'portability', 'restrict', 'object', 'withdraw_consent')),
  CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_subject_requests_user_id ON subject_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_subject_requests_status ON subject_requests(status);
