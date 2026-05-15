ALTER TABLE footprint_calculations
  DROP CONSTRAINT IF EXISTS footprint_calculations_data_quality_check,
  ADD CONSTRAINT footprint_calculations_data_quality_check
    CHECK (data_quality IN ('real', 'estimated'));
