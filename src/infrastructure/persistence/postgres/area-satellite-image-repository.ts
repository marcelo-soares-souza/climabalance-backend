import type { Pool, PoolClient } from 'pg';
import { AreaSatelliteImage } from '../../../domain/areas/entities/area-satellite-image';
import type { AreaSatelliteImageRepository } from '../../../domain/areas/repositories/area-satellite-image-repository';

function mapRow(row: Record<string, unknown>): AreaSatelliteImage {
  return new AreaSatelliteImage({
    id: String(row.id),
    areaId: String(row.area_id),
    requestedByUserId: String(row.requested_by_user_id),
    sceneId: String(row.scene_id),
    collection: String(row.collection),
    captureDate: new Date(String(row.capture_date)),
    cloudCover: row.cloud_cover == null ? null : Number(row.cloud_cover),
    bboxWest: Number(row.bbox_west),
    bboxSouth: Number(row.bbox_south),
    bboxEast: Number(row.bbox_east),
    bboxNorth: Number(row.bbox_north),
    storagePath: String(row.storage_path),
    thumbnailPath: row.thumbnail_path == null ? null : String(row.thumbnail_path),
    fileSizeBytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
    isFallback: Boolean(row.is_fallback),
    createdAt: new Date(String(row.created_at)),
    deletedAt: row.deleted_at ? new Date(String(row.deleted_at)) : null,
  });
}

export class PostgresAreaSatelliteImageRepository implements AreaSatelliteImageRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

  async create(image: AreaSatelliteImage): Promise<void> {
    await this.pool.query(
      `INSERT INTO area_satellite_images (
        id, area_id, requested_by_user_id, scene_id, collection,
        capture_date, cloud_cover, bbox_west, bbox_south, bbox_east, bbox_north,
        storage_path, thumbnail_path, file_size_bytes, is_fallback,
        created_at, deleted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        image.id, image.areaId, image.requestedByUserId, image.sceneId, image.collection,
        image.captureDate, image.cloudCover,
        image.bboxWest, image.bboxSouth, image.bboxEast, image.bboxNorth,
        image.storagePath, image.thumbnailPath, image.fileSizeBytes, image.isFallback,
        image.createdAt, image.deletedAt,
      ],
    );
  }

  async findById(id: string): Promise<AreaSatelliteImage | null> {
    const result = await this.pool.query(
      `SELECT * FROM area_satellite_images WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  async findLatestByAreaId(areaId: string): Promise<AreaSatelliteImage | null> {
    const result = await this.pool.query(
      `SELECT * FROM area_satellite_images
       WHERE area_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [areaId],
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  async softDeletePreviousForArea(areaId: string, deletedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE area_satellite_images
       SET deleted_at = $2
       WHERE area_id = $1 AND deleted_at IS NULL`,
      [areaId, deletedAt],
    );
  }

  async softDelete(id: string, deletedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE area_satellite_images SET deleted_at = $2 WHERE id = $1`,
      [id, deletedAt],
    );
  }
}
