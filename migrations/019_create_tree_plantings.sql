-- Individual tree planting points recorded by producers.

CREATE TABLE IF NOT EXISTS tree_plantings (
  id VARCHAR(36) PRIMARY KEY,
  area_id VARCHAR(36) NOT NULL,
  planted_by_user_id VARCHAR(36) NOT NULL,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (area_id) REFERENCES areas(id),
  FOREIGN KEY (planted_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tree_plantings_area_id ON tree_plantings(area_id);
CREATE INDEX IF NOT EXISTS idx_tree_plantings_deleted_at ON tree_plantings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tree_plantings_planted_by ON tree_plantings(planted_by_user_id);
