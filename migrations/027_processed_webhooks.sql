-- Stores processed webhook events to guarantee idempotent processing.

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id VARCHAR(36) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  event_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  processed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_processed_webhooks_provider_event
  ON processed_webhooks (provider, event_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_provider_type
  ON processed_webhooks (provider, event_type)
  WHERE deleted_at IS NULL;
