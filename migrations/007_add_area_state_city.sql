-- =========================
-- Migration 007: Add state/city columns to areas
-- Created: 2026-02-03
-- Description: Adds missing state and city columns if they don't exist
-- =========================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'areas' AND column_name = 'state') THEN
    ALTER TABLE areas ADD COLUMN state VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'areas' AND column_name = 'city') THEN
    ALTER TABLE areas ADD COLUMN city VARCHAR(100);
  END IF;
END $$;
