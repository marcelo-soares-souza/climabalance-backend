-- Migration: Update Footprint Schema
-- Description: Extends the existing footprint calculation schema to support
--              individual and legal entity profiles, draft/finalized workflow,
--              and detailed breakdown tracking.
-- Dependencies: 001_init_schema.sql, 002_add_password_reset_tokens.sql

-- =========================
-- 1. Update emission_factors table
-- =========================
-- Add region and version for hybrid emission factor approach (international + local)
ALTER TABLE IF EXISTS emission_factors ADD COLUMN IF NOT EXISTS region VARCHAR(10) DEFAULT 'BR';
ALTER TABLE IF EXISTS emission_factors ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '2026-01';
ALTER TABLE IF EXISTS emission_factors ADD COLUMN IF NOT EXISTS metadata_json TEXT;

CREATE INDEX IF NOT EXISTS idx_emission_factors_region ON emission_factors(region);
CREATE INDEX IF NOT EXISTS idx_emission_factors_version ON emission_factors(version);

-- =========================
-- 2. Update footprint_calculations table
-- =========================
-- Add profile type (individual vs legal entity)
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS profile_type VARCHAR(30) NOT NULL DEFAULT 'individual';

-- Add period tracking
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS period_end DATE;

-- Rename total_co2_kg to follow naming convention
DO $$
BEGIN
  IF to_regclass('footprint_calculations') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_calculations'
        AND column_name = 'total_co2_kg'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_calculations'
        AND column_name = 'total_kg_co2e'
    )
  THEN
    ALTER TABLE footprint_calculations RENAME COLUMN total_co2_kg TO total_kg_co2e;
  END IF;
END $$;

-- Add total in tons (tCO2e)
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS total_t_co2e DECIMAL(18, 6);

-- Add data quality indicator
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS data_quality VARCHAR(30) DEFAULT 'estimated';

-- Add factors version snapshot
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS factors_version VARCHAR(20) DEFAULT '2026-01';

-- Add status for draft/finalized workflow
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'draft';
ALTER TABLE IF EXISTS footprint_calculations ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;

-- Add constraints
DO $$
BEGIN
  IF to_regclass('footprint_calculations') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_calculations'
        AND column_name = 'profile_type'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'check_profile_type'
        AND conrelid = to_regclass('footprint_calculations')
    )
  THEN
    ALTER TABLE footprint_calculations ADD CONSTRAINT check_profile_type
      CHECK (profile_type IN ('individual', 'legal_entity'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('footprint_calculations') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_calculations'
        AND column_name = 'data_quality'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'check_data_quality'
        AND conrelid = to_regclass('footprint_calculations')
    )
  THEN
    ALTER TABLE footprint_calculations ADD CONSTRAINT check_data_quality
      CHECK (data_quality IN ('real', 'estimated', 'standard'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('footprint_calculations') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_calculations'
        AND column_name = 'status'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'check_status'
        AND conrelid = to_regclass('footprint_calculations')
    )
  THEN
    ALTER TABLE footprint_calculations ADD CONSTRAINT check_status
      CHECK (status IN ('draft', 'finalized'));
  END IF;
END $$;

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_footprint_calculations_status ON footprint_calculations(status);
CREATE INDEX IF NOT EXISTS idx_footprint_calculations_profile ON footprint_calculations(profile_type);
CREATE INDEX IF NOT EXISTS idx_footprint_calculations_period ON footprint_calculations(period_start, period_end);

-- =========================
-- 3. Rename and update footprint_items → footprint_input
-- =========================
-- Rename table to better reflect its purpose
DO $$
BEGIN
  IF to_regclass('footprint_items') IS NOT NULL
    AND to_regclass('footprint_input') IS NULL
  THEN
    ALTER TABLE footprint_items RENAME TO footprint_input;
  END IF;
END $$;

-- Add category field (energy, fuel, transport, flights, scope1, scope2, scope3)
ALTER TABLE IF EXISTS footprint_input ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Add metadata for additional context (vehicle type, fuel type, flight class, etc.)
ALTER TABLE IF EXISTS footprint_input ADD COLUMN IF NOT EXISTS metadata_json TEXT;

-- Rename co2_kg to follow naming convention
DO $$
BEGIN
  IF to_regclass('footprint_input') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_input'
        AND column_name = 'co2_kg'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_input'
        AND column_name = 'kg_co2e'
    )
  THEN
    ALTER TABLE footprint_input RENAME COLUMN co2_kg TO kg_co2e;
  END IF;
END $$;

-- Backfill category from activity_type for existing records (if any)
DO $$
BEGIN
  IF to_regclass('footprint_input') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_input'
        AND column_name = 'category'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'footprint_input'
        AND column_name = 'activity_type'
    )
  THEN
    UPDATE footprint_input SET category = activity_type WHERE category IS NULL;
  END IF;
END $$;

-- Add index
CREATE INDEX IF NOT EXISTS idx_footprint_input_category ON footprint_input(category);

-- =========================
-- 4. Create footprint_result_breakdown table
-- =========================
-- Stores aggregated results by category for each calculation
CREATE TABLE IF NOT EXISTS footprint_result_breakdown (
  id VARCHAR(36) PRIMARY KEY,
  calculation_id VARCHAR(36) NOT NULL,
  category VARCHAR(50) NOT NULL,
  kg_co2e DECIMAL(18, 6) NOT NULL,
  t_co2e DECIMAL(18, 6) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (calculation_id) REFERENCES footprint_calculations(id)
);

CREATE INDEX IF NOT EXISTS idx_breakdown_calc_id ON footprint_result_breakdown(calculation_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_category ON footprint_result_breakdown(category);

-- =========================
-- 5. Create compensation_projection table
-- =========================
-- Stores projections for how many trees are needed to compensate a calculation
CREATE TABLE IF NOT EXISTS compensation_projection (
  id VARCHAR(36) PRIMARY KEY,
  calculation_id VARCHAR(36) NOT NULL,
  area_id VARCHAR(36) NOT NULL,
  biome VARCHAR(100),
  t_co2e_per_tree_per_year DECIMAL(18, 6) NOT NULL,
  trees_needed DECIMAL(12, 2) NOT NULL,
  horizon_years DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (calculation_id) REFERENCES footprint_calculations(id),
  FOREIGN KEY (area_id) REFERENCES areas(id)
);

CREATE INDEX IF NOT EXISTS idx_projection_calc_id ON compensation_projection(calculation_id);
CREATE INDEX IF NOT EXISTS idx_projection_area_id ON compensation_projection(area_id);
