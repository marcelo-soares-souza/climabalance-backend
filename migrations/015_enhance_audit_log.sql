-- Enhance audit_log with additional context and tracking fields
-- This provides comprehensive audit trail for compliance, security, and debugging

ALTER TABLE audit_log
  -- Request context
  ADD COLUMN user_agent VARCHAR(500),
  ADD COLUMN request_id VARCHAR(50),
  ADD COLUMN session_id VARCHAR(50),
  ADD COLUMN referer VARCHAR(500),

  -- Operation result
  ADD COLUMN success BOOLEAN DEFAULT true,
  ADD COLUMN error_code VARCHAR(50),
  ADD COLUMN http_status INTEGER,

  -- Geolocation (derived from IP)
  ADD COLUMN country_code VARCHAR(2),
  ADD COLUMN city VARCHAR(100),
  ADD COLUMN timezone VARCHAR(50),

  -- Criticality and categorization
  ADD COLUMN severity VARCHAR(20) DEFAULT 'info',
  ADD COLUMN category VARCHAR(50)[],
  ADD COLUMN is_sensitive BOOLEAN DEFAULT false,

  -- State tracking (for data changes)
  ADD COLUMN previous_state JSONB,
  ADD COLUMN new_state JSONB,
  ADD COLUMN changed_fields TEXT[],

  -- Performance tracking
  ADD COLUMN duration_ms INTEGER,
  ADD COLUMN resource_changes INTEGER DEFAULT 0;

-- Add constraints
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_severity_check
    CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical'));

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_http_status_check
    CHECK (http_status IS NULL OR (http_status >= 100 AND http_status < 600));

-- Create useful indexes
CREATE INDEX idx_audit_log_success ON audit_log(success) WHERE success = false;
CREATE INDEX idx_audit_log_severity ON audit_log(severity) WHERE severity IN ('warning', 'error', 'critical');
CREATE INDEX idx_audit_log_country ON audit_log(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX idx_audit_log_request_id ON audit_log(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_log_category ON audit_log USING GIN(category);
CREATE INDEX idx_audit_log_changed_fields ON audit_log USING GIN(changed_fields);

-- Add comments
COMMENT ON COLUMN audit_log.user_agent IS 'Browser/device user agent string';
COMMENT ON COLUMN audit_log.request_id IS 'Unique request ID for correlation with application logs';
COMMENT ON COLUMN audit_log.success IS 'Whether the operation completed successfully';
COMMENT ON COLUMN audit_log.severity IS 'Severity level: debug, info, warning, error, critical';
COMMENT ON COLUMN audit_log.category IS 'Categories like financial, security, compliance, data_modification';
COMMENT ON COLUMN audit_log.previous_state IS 'State before the operation (sanitized)';
COMMENT ON COLUMN audit_log.new_state IS 'State after the operation (sanitized)';
COMMENT ON COLUMN audit_log.changed_fields IS 'List of field names that were modified';
COMMENT ON COLUMN audit_log.country_code IS 'ISO 3166-1 alpha-2 country code derived from IP';
COMMENT ON COLUMN audit_log.duration_ms IS 'Operation duration in milliseconds';
