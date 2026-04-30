CREATE TABLE IF NOT EXISTS job_queue (
  id VARCHAR(36) PRIMARY KEY,
  job_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  last_error TEXT,
  scheduled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_queue_pending ON job_queue(status, scheduled_at) WHERE status = 'pending' AND deleted_at IS NULL;
