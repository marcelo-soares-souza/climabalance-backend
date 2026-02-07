-- Adds support for tree-based compensation mode with 20-year horizon metadata.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compensations') THEN
    ALTER TABLE compensations
      ADD COLUMN IF NOT EXISTS compensation_mode VARCHAR(30) DEFAULT 'tco2e',
      ADD COLUMN IF NOT EXISTS horizon_years INTEGER,
      ADD COLUMN IF NOT EXISTS trees_requested INTEGER,
      ADD COLUMN IF NOT EXISTS price_per_tree DECIMAL(18, 2),
      ADD COLUMN IF NOT EXISTS estimated_total_t_co2e DECIMAL(18, 6);

    UPDATE compensations
    SET compensation_mode = 'tco2e'
    WHERE compensation_mode IS NULL;

    UPDATE compensations
    SET estimated_total_t_co2e = COALESCE(total_t_co2e, (total_co2_kg / 1000.0))
    WHERE estimated_total_t_co2e IS NULL;

    ALTER TABLE compensations
      DROP CONSTRAINT IF EXISTS check_compensations_mode;
    ALTER TABLE compensations
      ADD CONSTRAINT check_compensations_mode
      CHECK (compensation_mode IN ('tco2e', 'tree_purchase'));

    ALTER TABLE compensations
      DROP CONSTRAINT IF EXISTS check_compensations_horizon_years;
    ALTER TABLE compensations
      ADD CONSTRAINT check_compensations_horizon_years
      CHECK (horizon_years IS NULL OR horizon_years > 0);

    ALTER TABLE compensations
      DROP CONSTRAINT IF EXISTS check_compensations_trees_requested;
    ALTER TABLE compensations
      ADD CONSTRAINT check_compensations_trees_requested
      CHECK (trees_requested IS NULL OR trees_requested > 0);

    ALTER TABLE compensations
      DROP CONSTRAINT IF EXISTS check_compensations_price_per_tree;
    ALTER TABLE compensations
      ADD CONSTRAINT check_compensations_price_per_tree
      CHECK (price_per_tree IS NULL OR price_per_tree > 0);

    ALTER TABLE compensations
      DROP CONSTRAINT IF EXISTS check_compensations_estimated_total_t_co2e;
    ALTER TABLE compensations
      ADD CONSTRAINT check_compensations_estimated_total_t_co2e
      CHECK (estimated_total_t_co2e IS NULL OR estimated_total_t_co2e > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compensations_mode ON compensations(compensation_mode);
