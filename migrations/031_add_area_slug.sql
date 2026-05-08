-- Add slug column to areas table for user-friendly URLs
ALTER TABLE areas ADD COLUMN slug VARCHAR(200);

-- Backfill slugs for existing non-deleted areas.
-- IMPORTANT: use r.name directly, NOT convert_to(..., 'UTF8')::text
-- which produces bytea hex output (e.g. \x4d79...) instead of readable text.
DO $$
DECLARE
  r RECORD;
  base VARCHAR(200);
  candidate VARCHAR(200);
  suffix4 VARCHAR(4);
  suffix8 VARCHAR(8);
  max_base_len CONSTANT INT := 191;
BEGIN
  FOR r IN SELECT id, name FROM areas WHERE deleted_at IS NULL ORDER BY created_at LOOP
    base := regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(r.name),
          '[^\w\s-]', '', 'g'
        ),
        '[\s_]+', '-', 'g'
      ),
      '-+', '-', 'g'
    );
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    base := left(base, max_base_len);
    IF base = '' THEN base := 'area'; END IF;

    suffix4 := left(replace(r.id::text, '-', ''), 4);
    suffix8 := left(replace(r.id::text, '-', ''), 8);

    candidate := base;
    IF EXISTS (SELECT 1 FROM areas WHERE slug = candidate AND id != r.id AND deleted_at IS NULL) THEN
      candidate := left(base, max_base_len - 5) || '-' || suffix4;
    END IF;
    IF EXISTS (SELECT 1 FROM areas WHERE slug = candidate AND id != r.id AND deleted_at IS NULL) THEN
      candidate := left(base, max_base_len - 9) || '-' || suffix8;
    END IF;

    UPDATE areas SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE areas ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX idx_areas_slug ON areas(slug) WHERE deleted_at IS NULL;
