import type { UserConsent, SubjectRequest } from "../../../domain/user/user";
import type {
  ConsentRepository,
  CreateConsentInput,
  CreateSubjectRequestInput,
} from "../../../domain/user/consent-repository";
import type { DbClient } from "./db-client";

function mapConsent(row: Record<string, unknown>): UserConsent {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    consentType: row.consent_type as string,
    consented: row.consented as boolean,
    version: row.version as string | undefined,
    ipAddress: row.ip_address as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

function mapSubjectRequest(row: Record<string, unknown>): SubjectRequest {
  return {
    id: row.id as string,
    userId: row.user_id as string | undefined,
    requestType: row.request_type as string,
    status: row.status as string,
    details: row.details as string | undefined,
    resolutionNotes: row.resolution_notes as string | undefined,
    resolvedByUserId: row.resolved_by_user_id as string | undefined,
    resolvedAt: row.resolved_at
      ? new Date(row.resolved_at as string)
      : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

export class PostgresConsentRepository implements ConsentRepository {
  constructor(private readonly db: DbClient) {}

  async recordConsent(input: CreateConsentInput): Promise<UserConsent> {
    const now = new Date();
    const result = await this.db.query(
      `INSERT INTO user_consents (id, user_id, consent_type, consented, version, ip_address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        input.id,
        input.userId,
        input.consentType,
        input.consented,
        input.version ?? null,
        input.ipAddress ?? null,
        now,
      ],
    );
    return mapConsent(result.rows[0]);
  }

  async getConsentsByUser(userId: string): Promise<UserConsent[]> {
    const result = await this.db.query(
      `SELECT * FROM user_consents WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(mapConsent);
  }

  async getConsent(
    userId: string,
    consentType: string,
  ): Promise<UserConsent | null> {
    const result = await this.db.query(
      `SELECT * FROM user_consents WHERE user_id = $1 AND consent_type = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [userId, consentType],
    );
    if (result.rowCount === 0) return null;
    return mapConsent(result.rows[0]);
  }

  async createSubjectRequest(
    input: CreateSubjectRequestInput,
  ): Promise<SubjectRequest> {
    const now = new Date();
    const result = await this.db.query(
      `INSERT INTO subject_requests (id, user_id, request_type, status, details, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $5)
       RETURNING *`,
      [
        input.id,
        input.userId ?? null,
        input.requestType,
        input.details ?? null,
        now,
      ],
    );
    return mapSubjectRequest(result.rows[0]);
  }

  async getSubjectRequestsByUser(userId: string): Promise<SubjectRequest[]> {
    const result = await this.db.query(
      `SELECT * FROM subject_requests WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(mapSubjectRequest);
  }

  async updateSubjectRequestStatus(
    id: string,
    status: string,
    resolvedByUserId?: string,
    resolutionNotes?: string,
  ): Promise<SubjectRequest | null> {
    const now = new Date();
    const result = await this.db.query(
      `UPDATE subject_requests
       SET status = $1, resolved_by_user_id = $2, resolved_at = $3, resolution_notes = $4, updated_at = $3
       WHERE id = $5 AND deleted_at IS NULL
       RETURNING *`,
      [status, resolvedByUserId ?? null, now, resolutionNotes ?? null, id],
    );
    if (result.rowCount === 0) return null;
    return mapSubjectRequest(result.rows[0]);
  }
}
