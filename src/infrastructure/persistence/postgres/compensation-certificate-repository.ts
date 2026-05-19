import type { Pool, PoolClient } from "pg";
import type {
  CertificateFileRecord,
  CompensationCertificateListItem,
  CompensationCertificateLookup,
  CompensationCertificateRecord,
  CompensationCertificateRepository,
} from "../../../domain/compensations/repositories/compensation-certificate-repository";

export class PostgresCompensationCertificateRepository implements CompensationCertificateRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

  async createFile(record: CertificateFileRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO files (
        id,
        owner_user_id,
        file_type,
        file_name,
        mime_type,
        storage_url,
        checksum,
        size_bytes,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )`,
      [
        record.id,
        record.ownerUserId,
        record.fileType,
        record.fileName,
        record.mimeType,
        record.storageUrl,
        record.checksum ?? null,
        record.sizeBytes,
        record.createdAt,
        record.updatedAt,
        record.deletedAt ?? null,
      ],
    );
  }

  async createCertificate(
    record: CompensationCertificateRecord,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO certificates (
        id,
        compensation_id,
        certificate_number,
        file_id,
        issued_at,
        authenticity_hash,
        validation_url,
        qr_code_data,
        status,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )`,
      [
        record.id,
        record.compensationId,
        record.certificateNumber,
        record.fileId,
        record.issuedAt,
        record.authenticityHash ?? null,
        record.validationUrl ?? null,
        record.qrCodeData ?? null,
        record.status,
        record.createdAt,
        record.updatedAt,
        record.deletedAt ?? null,
      ],
    );
  }

  async findByCompensationId(
    compensationId: string,
  ): Promise<CompensationCertificateLookup | null> {
    const result = await this.pool.query(
      `SELECT
        c.id,
        c.compensation_id,
        c.certificate_number,
        c.file_id,
        c.issued_at,
        c.authenticity_hash,
        c.validation_url,
        c.qr_code_data,
        c.status,
        comp.supporter_user_id,
        f.file_name,
        f.mime_type,
        f.storage_url
      FROM certificates c
      INNER JOIN compensations comp
        ON comp.id = c.compensation_id
       AND comp.deleted_at IS NULL
      INNER JOIN files f
        ON f.id = c.file_id
       AND f.deleted_at IS NULL
      WHERE c.compensation_id = $1
        AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 1`,
      [compensationId],
    );

    if (result.rows.length === 0) {
      return null;
    }
    return mapLookupRow(result.rows[0] as Record<string, unknown>);
  }

  async findByCertificateNumber(
    certificateNumber: string,
  ): Promise<CompensationCertificateLookup | null> {
    const result = await this.pool.query(
      `SELECT
        c.id,
        c.compensation_id,
        c.certificate_number,
        c.file_id,
        c.issued_at,
        c.authenticity_hash,
        c.validation_url,
        c.qr_code_data,
        c.status,
        comp.supporter_user_id,
        f.file_name,
        f.mime_type,
        f.storage_url
      FROM certificates c
      INNER JOIN compensations comp
        ON comp.id = c.compensation_id
       AND comp.deleted_at IS NULL
      INNER JOIN files f
        ON f.id = c.file_id
       AND f.deleted_at IS NULL
      WHERE c.certificate_number = $1
        AND c.deleted_at IS NULL
      LIMIT 1`,
      [certificateNumber],
    );

    if (result.rows.length === 0) {
      return null;
    }
    return mapLookupRow(result.rows[0] as Record<string, unknown>);
  }

  async findById(
    certificateId: string,
  ): Promise<CompensationCertificateLookup | null> {
    const result = await this.pool.query(
      `SELECT
        c.id,
        c.compensation_id,
        c.certificate_number,
        c.file_id,
        c.issued_at,
        c.authenticity_hash,
        c.validation_url,
        c.qr_code_data,
        c.status,
        comp.supporter_user_id,
        f.file_name,
        f.mime_type,
        f.storage_url
      FROM certificates c
      INNER JOIN compensations comp
        ON comp.id = c.compensation_id
       AND comp.deleted_at IS NULL
      INNER JOIN files f
        ON f.id = c.file_id
       AND f.deleted_at IS NULL
      WHERE c.id = $1
        AND c.deleted_at IS NULL
      LIMIT 1`,
      [certificateId],
    );

    if (result.rows.length === 0) {
      return null;
    }
    return mapLookupRow(result.rows[0] as Record<string, unknown>);
  }

  async listBySupporterUserId(params: {
    supporterUserId: string;
    status?: "issued" | "revoked";
    limit: number;
    offset: number;
  }): Promise<CompensationCertificateListItem[]> {
    const limit = Number.isFinite(params.limit)
      ? Math.max(1, Math.min(100, Math.trunc(params.limit)))
      : 20;
    const offset = Number.isFinite(params.offset)
      ? Math.max(0, Math.trunc(params.offset))
      : 0;
    const statusFilter = params.status ?? null;

    const result = await this.pool.query(
      `SELECT
        c.id,
        c.compensation_id,
        c.certificate_number,
        c.issued_at,
        c.status,
        c.authenticity_hash,
        c.validation_url,
        c.qr_code_data,
        f.file_name,
        f.mime_type
      FROM certificates c
      INNER JOIN compensations comp
        ON comp.id = c.compensation_id
       AND comp.deleted_at IS NULL
      INNER JOIN files f
        ON f.id = c.file_id
       AND f.deleted_at IS NULL
      WHERE comp.supporter_user_id = $1
        AND c.deleted_at IS NULL
        AND ($2::VARCHAR IS NULL OR c.status = $2)
      ORDER BY c.issued_at DESC NULLS LAST, c.created_at DESC
      LIMIT $3
      OFFSET $4`,
      [params.supporterUserId, statusFilter, limit, offset],
    );

    return result.rows.map((row) =>
      mapListItemRow(row as Record<string, unknown>),
    );
  }
}

function mapLookupRow(
  row: Record<string, unknown>,
): CompensationCertificateLookup {
  return {
    id: String(row.id),
    compensationId: String(row.compensation_id),
    certificateNumber: String(row.certificate_number),
    fileId: String(row.file_id),
    issuedAt: row.issued_at ? new Date(String(row.issued_at)) : null,
    authenticityHash:
      row.authenticity_hash == null ? null : String(row.authenticity_hash),
    validationUrl:
      row.validation_url == null ? null : String(row.validation_url),
    qrCodeData: row.qr_code_data == null ? null : String(row.qr_code_data),
    status: String(row.status) as CompensationCertificateLookup["status"],
    supporterUserId: String(row.supporter_user_id),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    storageUrl: String(row.storage_url),
  };
}

function mapListItemRow(
  row: Record<string, unknown>,
): CompensationCertificateListItem {
  return {
    id: String(row.id),
    compensationId: String(row.compensation_id),
    certificateNumber: String(row.certificate_number),
    issuedAt: row.issued_at ? new Date(String(row.issued_at)) : null,
    status: String(row.status) as CompensationCertificateListItem["status"],
    authenticityHash:
      row.authenticity_hash == null ? null : String(row.authenticity_hash),
    validationUrl:
      row.validation_url == null ? null : String(row.validation_url),
    qrCodeData: row.qr_code_data == null ? null : String(row.qr_code_data),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
  };
}
