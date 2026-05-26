-- Add admin workflow fields to subject_requests table

ALTER TABLE subject_requests
  ADD COLUMN IF NOT EXISTS assignee_user_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS legal_basis VARCHAR(100),
  ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_categories_affected TEXT[];

-- Add foreign key for assignee
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_subject_requests_assignee'
  ) THEN
    ALTER TABLE subject_requests
      ADD CONSTRAINT fk_subject_requests_assignee
      FOREIGN KEY (assignee_user_id) REFERENCES users(id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_subject_requests_assignee ON subject_requests(assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_subject_requests_due_at ON subject_requests(due_at);
