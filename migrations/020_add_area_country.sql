DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'areas' AND column_name = 'country_code'
  ) THEN
    ALTER TABLE areas ADD COLUMN country_code VARCHAR(2);
    COMMENT ON COLUMN areas.country_code IS 'ISO 3166-1 alpha-2 country code';
  END IF;
END $$;
