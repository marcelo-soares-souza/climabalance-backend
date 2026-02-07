import type { Pool, PoolClient } from 'pg';
import type {
  AreaMedia,
  AreaMediaRepository
} from '../../../domain/areas/repositories/area-media-repository';

function mapRow(row: Record<string, unknown>): AreaMedia {
  return {
    id: String(row.id),
    areaId: String(row.area_id),
    uploadedByUserId: String(row.uploaded_by_user_id),
    mediaType: String(row.media_type) as AreaMedia['mediaType'],
    description: row.description == null ? null : String(row.description),
    mimeType: String(row.mime_type),
    originalFileName: String(row.original_file_name),
    storagePath: String(row.storage_path),
    fileSizeBytes: Number(row.file_size_bytes),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    deletedAt: row.deleted_at ? new Date(String(row.deleted_at)) : null,
  };
}

export class PostgresAreaMediaRepository implements AreaMediaRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

  async create(media: AreaMedia): Promise<void> {
    await this.pool.query(
      `INSERT INTO area_media (
        id,
        area_id,
        uploaded_by_user_id,
        media_type,
        description,
        mime_type,
        original_file_name,
        storage_path,
        file_size_bytes,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )`,
      [
        media.id,
        media.areaId,
        media.uploadedByUserId,
        media.mediaType,
        media.description ?? null,
        media.mimeType,
        media.originalFileName,
        media.storagePath,
        media.fileSizeBytes,
        media.createdAt,
        media.updatedAt,
        media.deletedAt ?? null,
      ]
    );
  }

  async findById(id: string): Promise<AreaMedia | null> {
    const result = await this.pool.query(
      `SELECT * FROM area_media WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return mapRow(result.rows[0] as Record<string, unknown>);
  }

  async listByAreaId(areaId: string): Promise<AreaMedia[]> {
    const result = await this.pool.query(
      `SELECT * FROM area_media WHERE area_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [areaId]
    );
    return result.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async softDelete(id: string, deletedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE area_media SET deleted_at = $2, updated_at = $2 WHERE id = $1`,
      [id, deletedAt]
    );
  }
}
