-- Legal text versioning: tracks published versions of Privacy Policy and Terms of Use
-- Enables defensible consent evidence by linking each acceptance to an exact version

CREATE TABLE IF NOT EXISTS legal_versions (
  id VARCHAR(36) PRIMARY KEY,
  document_type VARCHAR(30) NOT NULL,
  version VARCHAR(20) NOT NULL,
  effective_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CONSTRAINT uq_legal_versions_doc_version UNIQUE (document_type, version),
  CHECK (document_type IN ('privacy_policy', 'terms_of_use'))
);

CREATE INDEX IF NOT EXISTS idx_legal_versions_document_type ON legal_versions(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_versions_effective_at ON legal_versions(effective_at DESC);

-- Seed initial versions matching the text published on 2026-05-26 (updated per compliance review)
INSERT INTO legal_versions (id, document_type, version, effective_at) VALUES
  (gen_random_uuid(), 'privacy_policy', '2026-05-26', '2026-05-26 00:00:00'),
  (gen_random_uuid(), 'terms_of_use', '2026-05-26', '2026-05-26 00:00:00');
