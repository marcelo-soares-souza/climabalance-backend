-- Adds tree-support pricing and impact horizon fields to areas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'areas') THEN
    ALTER TABLE areas
      ADD COLUMN IF NOT EXISTS price_per_tree DECIMAL(18, 2),
      ADD COLUMN IF NOT EXISTS default_horizon_years INTEGER;

    UPDATE areas
    SET default_horizon_years = 20
    WHERE default_horizon_years IS NULL
      AND t_co2e_per_tree_per_year IS NOT NULL;

    ALTER TABLE areas
      DROP CONSTRAINT IF EXISTS check_areas_price_per_tree_positive;
    ALTER TABLE areas
      ADD CONSTRAINT check_areas_price_per_tree_positive
      CHECK (price_per_tree IS NULL OR price_per_tree > 0);

    ALTER TABLE areas
      DROP CONSTRAINT IF EXISTS check_areas_default_horizon_years_positive;
    ALTER TABLE areas
      ADD CONSTRAINT check_areas_default_horizon_years_positive
      CHECK (default_horizon_years IS NULL OR default_horizon_years > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_areas_price_per_tree ON areas(price_per_tree);

COMMENT ON COLUMN areas.price_per_tree IS 'Tree planting contribution price per tree';
COMMENT ON COLUMN areas.default_horizon_years IS 'Default horizon used to estimate CO2 removal impact for tree contributions';
