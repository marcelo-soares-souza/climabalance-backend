-- =========================
-- Migration 005: Areas and Projects Schema
-- Created: 2026-02-02
-- Description: Creates/updates areas and area_criteria tables (idempotent)
-- =========================

-- =========================
-- 1. Create or update areas table
-- =========================

-- Create table if it doesn't exist (fresh install)
CREATE TABLE IF NOT EXISTS areas (
  id VARCHAR(36) PRIMARY KEY,
  owner_user_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  biome VARCHAR(100),
  state VARCHAR(50),
  city VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  audit_status VARCHAR(30),
  audit_notes TEXT,
  audited_by_user_id VARCHAR(36),
  audited_at TIMESTAMP,
  total_capacity_t_co2e DECIMAL(18, 6),
  committed_t_co2e DECIMAL(18, 6) DEFAULT 0,
  t_co2e_per_tree_per_year DECIMAL(10, 6),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Add missing columns if table already existed (for upgrades)
DO $$
BEGIN
  -- Add audit_status if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='audit_status') THEN
    ALTER TABLE areas ADD COLUMN audit_status VARCHAR(30);
  END IF;

  -- Add audit_notes if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='audit_notes') THEN
    ALTER TABLE areas ADD COLUMN audit_notes TEXT;
  END IF;

  -- Add audited_by_user_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='audited_by_user_id') THEN
    ALTER TABLE areas ADD COLUMN audited_by_user_id VARCHAR(36);
  END IF;

  -- Add audited_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='audited_at') THEN
    ALTER TABLE areas ADD COLUMN audited_at TIMESTAMP;
  END IF;

  -- Add total_capacity_t_co2e if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='total_capacity_t_co2e') THEN
    ALTER TABLE areas ADD COLUMN total_capacity_t_co2e DECIMAL(18, 6);
  END IF;

  -- Add committed_t_co2e if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='committed_t_co2e') THEN
    ALTER TABLE areas ADD COLUMN committed_t_co2e DECIMAL(18, 6) DEFAULT 0;
  END IF;

  -- Add t_co2e_per_tree_per_year if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='areas' AND column_name='t_co2e_per_tree_per_year') THEN
    ALTER TABLE areas ADD COLUMN t_co2e_per_tree_per_year DECIMAL(10, 6);
  END IF;

  -- Rename old columns if they exist (migration from old schema)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='areas' AND column_name='producer_id') THEN
    ALTER TABLE areas RENAME COLUMN producer_id TO owner_user_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='areas' AND column_name='area_name') THEN
    ALTER TABLE areas RENAME COLUMN area_name TO name;
  END IF;
END $$;

-- =========================
-- 2. Drop and recreate constraints (idempotent way)
-- =========================

-- Drop old constraints if they exist
ALTER TABLE areas DROP CONSTRAINT IF EXISTS areas_status_check;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_status;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_audit_status;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_capacity;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_committed;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_latitude;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS check_longitude;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS areas_audited_by_user_id_fkey;
ALTER TABLE areas DROP CONSTRAINT IF EXISTS areas_owner_user_id_fkey;

-- Create constraints
ALTER TABLE areas ADD CONSTRAINT check_status
  CHECK (status IN ('draft', 'pending_audit', 'approved', 'active', 'rejected', 'suspended'));

ALTER TABLE areas ADD CONSTRAINT check_audit_status
  CHECK (audit_status IS NULL OR audit_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE areas ADD CONSTRAINT check_capacity
  CHECK (total_capacity_t_co2e IS NULL OR total_capacity_t_co2e >= 0);

ALTER TABLE areas ADD CONSTRAINT check_committed
  CHECK (committed_t_co2e >= 0);

ALTER TABLE areas ADD CONSTRAINT check_latitude
  CHECK (latitude >= -90 AND latitude <= 90);

ALTER TABLE areas ADD CONSTRAINT check_longitude
  CHECK (longitude >= -180 AND longitude <= 180);

-- Add foreign keys
ALTER TABLE areas ADD CONSTRAINT areas_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE areas ADD CONSTRAINT areas_audited_by_user_id_fkey
  FOREIGN KEY (audited_by_user_id) REFERENCES users(id);

-- =========================
-- 3. Create indexes (idempotent)
-- =========================

CREATE INDEX IF NOT EXISTS idx_areas_owner ON areas(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_areas_status ON areas(status);
CREATE INDEX IF NOT EXISTS idx_areas_biome ON areas(biome);
CREATE INDEX IF NOT EXISTS idx_areas_location ON areas(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_areas_deleted ON areas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_areas_audit_status ON areas(audit_status);

-- =========================
-- 4. Create area_criteria table
-- =========================

CREATE TABLE IF NOT EXISTS area_criteria (
  id VARCHAR(36) PRIMARY KEY,
  area_id VARCHAR(36) NOT NULL,
  criterion_key VARCHAR(100) NOT NULL,
  criterion_label VARCHAR(200) NOT NULL,
  met BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Drop and recreate foreign key
ALTER TABLE area_criteria DROP CONSTRAINT IF EXISTS area_criteria_area_id_fkey;
ALTER TABLE area_criteria ADD CONSTRAINT area_criteria_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES areas(id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_area_criteria_area_id ON area_criteria(area_id);
CREATE INDEX IF NOT EXISTS idx_area_criteria_deleted ON area_criteria(deleted_at);

-- =========================
-- 5. Update compensation_projection FK (if table exists)
-- =========================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'compensation_projection') THEN
    ALTER TABLE compensation_projection DROP CONSTRAINT IF EXISTS compensation_projection_area_id_fkey;
    ALTER TABLE compensation_projection ADD CONSTRAINT compensation_projection_area_id_fkey
      FOREIGN KEY (area_id) REFERENCES areas(id);
  END IF;
END $$;

-- =========================
-- 6. Create or replace view
-- =========================

DROP VIEW IF EXISTS available_areas;

CREATE OR REPLACE VIEW available_areas AS
SELECT
  a.*,
  (COALESCE(a.total_capacity_t_co2e, 0) - COALESCE(a.committed_t_co2e, 0)) AS available_t_co2e
FROM areas a
WHERE a.status = 'active'
  AND a.deleted_at IS NULL
  AND (COALESCE(a.total_capacity_t_co2e, 0) - COALESCE(a.committed_t_co2e, 0)) > 0;

-- =========================
-- 7. Migrate old data (only if columns exist)
-- =========================

DO $$
BEGIN
  -- Map old status values to new ones (only if rows exist with old values)
  UPDATE areas SET status = 'pending_audit' WHERE status = 'submitted';
  UPDATE areas SET status = 'pending_audit' WHERE status = 'in_review';
  UPDATE areas SET status = 'draft' WHERE status = 'needs_info';

  -- Set default committed_t_co2e for existing rows
  UPDATE areas SET committed_t_co2e = 0 WHERE committed_t_co2e IS NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors (columns might not exist in fresh install)
    NULL;
END $$;

-- =========================
-- 8. Add comments
-- =========================

COMMENT ON TABLE areas IS 'Stores reforestation areas/projects with point-based locations';
COMMENT ON COLUMN areas.owner_user_id IS 'User who owns/manages this area';
COMMENT ON COLUMN areas.name IS 'Area/project name';
COMMENT ON COLUMN areas.latitude IS 'Latitude in decimal degrees (WGS84), range: -90 to 90, precision: 8 decimals';
COMMENT ON COLUMN areas.longitude IS 'Longitude in decimal degrees (WGS84), range: -180 to 180, precision: 8 decimals';
COMMENT ON COLUMN areas.status IS 'Area workflow status: draft → pending_audit → approved → active (or rejected/suspended)';
COMMENT ON COLUMN areas.audit_status IS 'Audit-specific status: pending | approved | rejected';
COMMENT ON COLUMN areas.total_capacity_t_co2e IS 'Maximum carbon sequestration capacity in tonnes CO2 equivalent';
COMMENT ON COLUMN areas.committed_t_co2e IS 'Amount of capacity already allocated to compensations';
COMMENT ON COLUMN areas.t_co2e_per_tree_per_year IS 'Carbon sequestration rate per tree per year (tCO2e)';

COMMENT ON TABLE area_criteria IS 'Socio-environmental audit criteria checklist for each area';
COMMENT ON COLUMN area_criteria.criterion_key IS 'Unique key for criterion type (e.g., legal_documentation, native_species)';
COMMENT ON COLUMN area_criteria.met IS 'Whether the criterion was met during audit';
