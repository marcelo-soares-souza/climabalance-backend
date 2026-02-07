-- Add explicit compensation tracking fields for atomic reservation flow.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compensations') THEN
    ALTER TABLE compensations
      ADD COLUMN IF NOT EXISTS total_t_co2e DECIMAL(18, 6),
      ADD COLUMN IF NOT EXISTS trees_count INTEGER;

    ALTER TABLE compensations
      DROP CONSTRAINT IF EXISTS check_compensations_total_t_co2e_positive;
    ALTER TABLE compensations
      ADD CONSTRAINT check_compensations_total_t_co2e_positive
      CHECK (total_t_co2e IS NULL OR total_t_co2e > 0);

    ALTER TABLE compensations
      DROP CONSTRAINT IF EXISTS check_compensations_trees_count_positive;
    ALTER TABLE compensations
      ADD CONSTRAINT check_compensations_trees_count_positive
      CHECK (trees_count IS NULL OR trees_count > 0);

    UPDATE compensations
    SET total_t_co2e = total_co2_kg / 1000.0
    WHERE total_t_co2e IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compensations_calc_id ON compensations(calculation_id);
