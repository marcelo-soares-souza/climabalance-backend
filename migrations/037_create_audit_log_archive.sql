-- Create archive table for audit log retention
-- Has the same structure as audit_log but without performance indexes
-- to minimize storage overhead of archived entries.

CREATE TABLE IF NOT EXISTS audit_log_archive (
  id VARCHAR(36) PRIMARY KEY,
  actor_user_id VARCHAR(36),
  actor_email VARCHAR(255),
  client_ip VARCHAR(45),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(36),
  reason TEXT,
  user_agent VARCHAR(500),
  request_id VARCHAR(50),
  session_id VARCHAR(50),
  referer VARCHAR(500),
  success BOOLEAN DEFAULT true,
  error_code VARCHAR(50),
  http_status INTEGER,
  country_code VARCHAR(2),
  city VARCHAR(100),
  timezone VARCHAR(50),
  severity VARCHAR(20) DEFAULT 'info',
  category VARCHAR(50)[],
  is_sensitive BOOLEAN DEFAULT false,
  previous_state JSONB,
  new_state JSONB,
  changed_fields TEXT[],
  duration_ms INTEGER,
  resource_changes INTEGER DEFAULT 0,
  previous_entry_hash VARCHAR(64),
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP
);

COMMENT ON TABLE audit_log_archive IS 'Archived audit log entries moved from audit_log for retention management';
COMMENT ON COLUMN audit_log_archive.archived_at IS 'Timestamp when the entry was moved to the archive';
