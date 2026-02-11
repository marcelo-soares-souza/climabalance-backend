-- Add client_ip and actor_email columns to audit_log table
-- This allows tracking IP addresses and email addresses in audit logs

ALTER TABLE audit_log
  ADD COLUMN client_ip VARCHAR(45),  -- IPv4 max 15 chars, IPv6 max 45 chars
  ADD COLUMN actor_email VARCHAR(255);

-- Create index for client_ip lookups
CREATE INDEX idx_audit_log_client_ip ON audit_log(client_ip) WHERE client_ip IS NOT NULL;

-- Add comment
COMMENT ON COLUMN audit_log.client_ip IS 'IP address of the client that performed the action';
COMMENT ON COLUMN audit_log.actor_email IS 'Email address of the actor user (denormalized for audit purposes)';
