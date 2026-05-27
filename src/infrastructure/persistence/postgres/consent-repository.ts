import type { UserConsent, SubjectRequest } from "../../../domain/user/user";
import type {
  ConsentRepository,
  CreateConsentInput,
  CreateSubjectRequestInput,
  SubjectRequestFilters,
  UpdateSubjectRequestInput,
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
    assigneeUserId: row.assignee_user_id as string | undefined,
    dueAt: row.due_at ? new Date(row.due_at as string) : undefined,
    legalBasis: row.legal_basis as string | undefined,
    identityVerified: (row.identity_verified as boolean) ?? false,
    dataCategoriesAffected:
      (row.data_categories_affected as string[]) ?? undefined,
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

  async getSubjectRequestById(id: string): Promise<SubjectRequest | null> {
    const result = await this.db.query(
      `SELECT * FROM subject_requests WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (result.rowCount === 0) return null;
    return mapSubjectRequest(result.rows[0]);
  }

  async listAllSubjectRequests(
    filters: SubjectRequestFilters,
  ): Promise<{ requests: SubjectRequest[]; total: number }> {
    const conditions: string[] = ["sr.deleted_at IS NULL"];
    const values: unknown[] = [];
    let index = 1;

    if (filters.status) {
      conditions.push(`sr.status = $${index++}`);
      values.push(filters.status);
    }
    if (filters.requestType) {
      conditions.push(`sr.request_type = $${index++}`);
      values.push(filters.requestType);
    }
    if (filters.assignedToUserId) {
      conditions.push(`sr.assignee_user_id = $${index++}`);
      values.push(filters.assignedToUserId);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM subject_requests sr WHERE ${whereClause}`,
      values,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    values.push(limit, offset);

    const result = await this.db.query(
      `SELECT sr.*, u.email as user_email
       FROM subject_requests sr
       LEFT JOIN users u ON u.id = sr.user_id
       WHERE ${whereClause}
       ORDER BY sr.created_at DESC
       LIMIT $${index++} OFFSET $${index++}`,
      values,
    );

    return { requests: result.rows.map(mapSubjectRequest), total };
  }

  async updateSubjectRequest(
    id: string,
    updates: UpdateSubjectRequestInput,
  ): Promise<SubjectRequest | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${index++}`);
      values.push(updates.status);
    }
    if (updates.assigneeUserId !== undefined) {
      fields.push(`assignee_user_id = $${index++}`);
      values.push(updates.assigneeUserId || null);
    }
    if (updates.resolvedByUserId !== undefined) {
      fields.push(`resolved_by_user_id = $${index++}`);
      values.push(updates.resolvedByUserId || null);
    }
    if (updates.resolutionNotes !== undefined) {
      fields.push(`resolution_notes = $${index++}`);
      values.push(updates.resolutionNotes || null);
    }
    if (updates.dueAt !== undefined) {
      fields.push(`due_at = $${index++}`);
      values.push(updates.dueAt);
    }
    if (updates.legalBasis !== undefined) {
      fields.push(`legal_basis = $${index++}`);
      values.push(updates.legalBasis || null);
    }
    if (updates.identityVerified !== undefined) {
      fields.push(`identity_verified = $${index++}`);
      values.push(updates.identityVerified);
    }
    if (updates.dataCategoriesAffected !== undefined) {
      fields.push(`data_categories_affected = $${index++}`);
      values.push(updates.dataCategoriesAffected);
    }

    if (fields.length === 0) {
      return this.getSubjectRequestById(id);
    }

    if (updates.status === "completed" || updates.status === "rejected") {
      fields.push(`resolved_at = $${index++}`);
      values.push(new Date());
    }

    fields.push(`updated_at = $${index++}`);
    values.push(new Date());
    values.push(id);

    const result = await this.db.query(
      `UPDATE subject_requests SET ${fields.join(", ")} WHERE id = $${index} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (result.rowCount === 0) return null;
    return mapSubjectRequest(result.rows[0]);
  }
}
