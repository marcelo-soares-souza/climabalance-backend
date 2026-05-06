DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS about TEXT;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS facebook_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS x_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bluesky_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mastodon_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS youtube_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(500);
  END IF;
END $$;
