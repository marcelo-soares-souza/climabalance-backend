DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'certificates') THEN
    ALTER TABLE certificates
      ADD COLUMN IF NOT EXISTS authenticity_hash VARCHAR(128),
      ADD COLUMN IF NOT EXISTS validation_url TEXT,
      ADD COLUMN IF NOT EXISTS qr_code_data TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_number_unique
  ON certificates(certificate_number)
  WHERE deleted_at IS NULL;
