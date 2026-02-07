-- Area media assets (photos/videos) for compensation transparency.
CREATE TABLE IF NOT EXISTS area_media (
  id VARCHAR(36) PRIMARY KEY,
  area_id VARCHAR(36) NOT NULL,
  uploaded_by_user_id VARCHAR(36) NOT NULL,
  media_type VARCHAR(20) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (area_id) REFERENCES areas(id),
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
  CONSTRAINT check_area_media_type CHECK (media_type IN ('photo', 'video')),
  CONSTRAINT check_area_media_size CHECK (file_size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_area_media_area_id ON area_media(area_id);
CREATE INDEX IF NOT EXISTS idx_area_media_deleted_at ON area_media(deleted_at);
CREATE INDEX IF NOT EXISTS idx_area_media_uploaded_by ON area_media(uploaded_by_user_id);
