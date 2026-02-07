-- Optional human-readable description for area media assets.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'area_media') THEN
    ALTER TABLE area_media
      ADD COLUMN IF NOT EXISTS description VARCHAR(500);
  END IF;
END $$;
