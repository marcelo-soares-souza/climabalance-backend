CREATE TABLE IF NOT EXISTS area_satellite_images (
  id VARCHAR(36) PRIMARY KEY,
  area_id VARCHAR(36) NOT NULL,
  requested_by_user_id VARCHAR(36) NOT NULL,
  scene_id VARCHAR(200) NOT NULL,
  collection VARCHAR(50) NOT NULL,
  capture_date DATE NOT NULL,
  cloud_cover DECIMAL(5,2),
  bbox_west DOUBLE PRECISION NOT NULL,
  bbox_south DOUBLE PRECISION NOT NULL,
  bbox_east DOUBLE PRECISION NOT NULL,
  bbox_north DOUBLE PRECISION NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  thumbnail_path VARCHAR(500),
  file_size_bytes BIGINT,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (area_id) REFERENCES areas(id),
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_area_sat_img_area
  ON area_satellite_images(area_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_area_sat_img_deleted
  ON area_satellite_images(deleted_at);
