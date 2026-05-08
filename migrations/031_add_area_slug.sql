-- Add slug column to areas table for user-friendly URLs
ALTER TABLE areas ADD COLUMN slug VARCHAR(200);

-- Backfill slugs for existing non-deleted areas
DO $$
DECLARE
  r RECORD;
  base VARCHAR(200);
  candidate VARCHAR(200);
  suffix4 VARCHAR(4);
  suffix8 VARCHAR(8);
BEGIN
  FOR r IN SELECT id, name FROM areas WHERE deleted_at IS NULL ORDER BY created_at LOOP
    base := regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(convert_to(r.name, 'UTF8')::text),
          '[^\w\s-]', '', 'g'
        ),
        '[\s_]+', '-', 'g'
      ),
      '-+', '-', 'g'
    );
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    base := left(base, 200);
    IF base = '' THEN base := 'area'; END IF;

    suffix4 := left(replace(r.id::text, '-', ''), 4);
    suffix8 := left(replace(r.id::text, '-', ''), 8);

    candidate := base;
    IF EXISTS (SELECT 1 FROM areas WHERE slug = candidate AND id != r.id AND deleted_at IS NULL) THEN
      candidate := base || '-' || suffix4;
    END IF;
    IF EXISTS (SELECT 1 FROM areas WHERE slug = candidate AND id != r.id AND deleted_at IS NULL) THEN
      candidate := base || '-' || suffix8;
    END IF;

    UPDATE areas SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE areas ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX idx_areas_slug ON areas(slug) WHERE deleted_at IS NULL;
