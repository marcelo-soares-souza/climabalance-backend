-- Add hash chain integrity to audit_log for tamper detection
-- Each entry stores the SHA-256 hash of the previous entry,
-- forming a chain that makes it computationally infeasible
-- to alter or insert entries without detection.

ALTER TABLE audit_log
  ADD COLUMN previous_entry_hash VARCHAR(64);

CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

COMMENT ON COLUMN audit_log.previous_entry_hash IS
  'SHA-256 hash of the preceding audit log entry, forming a tamper-evident chain. NULL for entries inserted before this migration.';
