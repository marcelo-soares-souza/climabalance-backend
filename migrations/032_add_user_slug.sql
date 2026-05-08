ALTER TABLE users ADD COLUMN slug VARCHAR(100);

-- IMPORTANT: use email_prefix directly, NOT convert_to(..., 'UTF8')::text
-- which produces bytea hex output instead of readable text.
DO $$
DECLARE
  r RECORD;
  base VARCHAR(100);
  candidate VARCHAR(100);
  email_prefix VARCHAR(100);
  suffix4 VARCHAR(4);
  suffix8 VARCHAR(8);
  max_base_len CONSTANT INT := 91;
BEGIN
  FOR r IN SELECT id, email FROM users WHERE deleted_at IS NULL ORDER BY created_at LOOP
    email_prefix := split_part(r.email, '@', 1);

    base := regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(email_prefix),
          '[^\w\s-]', '', 'g'
        ),
        '[\s_]+', '-', 'g'
      ),
      '-+', '-', 'g'
    );
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    base := left(base, max_base_len);
    IF base = '' THEN base := 'user'; END IF;

    suffix4 := left(replace(r.id::text, '-', ''), 4);
    suffix8 := left(replace(r.id::text, '-', ''), 8);

    candidate := base;
    IF EXISTS (SELECT 1 FROM users WHERE slug = candidate AND id != r.id AND deleted_at IS NULL) THEN
      candidate := left(base, max_base_len - 5) || '-' || suffix4;
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE slug = candidate AND id != r.id AND deleted_at IS NULL) THEN
      candidate := left(base, max_base_len - 9) || '-' || suffix8;
    END IF;

    UPDATE users SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX idx_users_slug ON users(slug) WHERE deleted_at IS NULL;
