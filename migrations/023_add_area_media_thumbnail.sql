-- Add thumbnail columns to area_media for lazy-generated resized images.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'area_media') THEN
    ALTER TABLE area_media
      ADD COLUMN IF NOT EXISTS thumbnail_storage_path VARCHAR(500),
      ADD COLUMN IF NOT EXISTS thumbnail_generated_at TIMESTAMP;
  END IF;
END $$;