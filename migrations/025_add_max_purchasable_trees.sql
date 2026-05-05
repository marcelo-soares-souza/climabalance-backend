-- Add max_purchasable_trees column to areas table.
-- Allows per-area override of the default max purchasable trees limit.
-- NULL means use DEFAULT_MAX_PURCHASABLE_TREES env var.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'areas') THEN
    ALTER TABLE areas
      ADD COLUMN IF NOT EXISTS max_purchasable_trees INTEGER;
  END IF;
END $$;

COMMENT ON COLUMN areas.max_purchasable_trees IS 'Per-area max purchasable tree limit. NULL = use DEFAULT_MAX_PURCHASABLE_TREES env var. Admins can override.';
