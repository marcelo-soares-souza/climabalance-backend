import type { Pool, PoolClient } from 'pg';
import type { User, UserProfile } from '../../../domain/user/user';
import type { CreateUserInput, UpdateUserInput, UserFilters, UserRepository } from '../../../domain/user/user-repository';
import { pgPool } from './pg-client';
import { uuidv7 } from '../../../shared/utils/id';

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    passwordHashVersion: row.password_hash_version as string | undefined,
    status: row.status as User['status'],
    locale: row.locale as string,
    emailConfirmedAt: row.email_confirmed_at ? new Date(row.email_confirmed_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null
  };
}

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    displayName: row.display_name as string | undefined,
    documentType: row.document_type as string | undefined,
    documentNumber: row.document_number as string | undefined,
    birthDate: row.birth_date ? String(row.birth_date) : undefined,
    phone: row.phone as string | undefined,
    countryCode: row.country_code as string | undefined,
    addressLine1: row.address_line1 as string | undefined,
    addressLine2: row.address_line2 as string | undefined,
    addressCity: row.address_city as string | undefined,
    addressState: row.address_state as string | undefined,
    addressPostalCode: row.address_postal_code as string | undefined,
    addressCountry: row.address_country as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null
  };
}

export class PostgresUserRepository implements UserRepository {
  constructor(private db: Pool | PoolClient = pgPool) {}

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const result = await this.db.query(
      `INSERT INTO users (id, email, password_hash, status, locale, email_confirmed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [input.id, input.email, input.passwordHash, input.status, input.locale, input.emailConfirmedAt, now]
    );
    return mapUser(result.rows[0]);
  }

  async update(input: UpdateUserInput): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (input.email !== undefined) {
      fields.push(`email = $${index++}`);
      values.push(input.email);
    }
    if (input.passwordHash !== undefined) {
      fields.push(`password_hash = $${index++}`);
      values.push(input.passwordHash);
    }
    if (input.status !== undefined) {
      fields.push(`status = $${index++}`);
      values.push(input.status);
    }
    if (input.locale !== undefined) {
      fields.push(`locale = $${index++}`);
      values.push(input.locale);
    }
    if (input.emailConfirmedAt !== undefined) {
      fields.push(`email_confirmed_at = $${index++}`);
      values.push(input.emailConfirmedAt);
    }
    if (input.deletedAt !== undefined) {
      fields.push(`deleted_at = $${index++}`);
      values.push(input.deletedAt);
    }

    fields.push(`updated_at = $${index++}`);
    values.push(new Date());

    if (fields.length === 1) {
      return this.findById(input.id);
    }

    values.push(input.id);

    const result = await this.db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );
    if (result.rowCount === 0) return null;
    return mapUser(result.rows[0]);
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (result.rowCount === 0) return null;
    return mapUser(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(`SELECT * FROM users WHERE email = $1`, [email]);
    if (result.rowCount === 0) return null;
    return mapUser(result.rows[0]);
  }

  async list(filters: UserFilters): Promise<User[]> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let index = 1;

    if (filters.status) {
      conditions.push(`status = $${index++}`);
      values.push(filters.status);
    }
    if (filters.search) {
      conditions.push(`email LIKE $${index++}`);
      values.push(`%${filters.search}%`);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    values.push(limit, offset);

    const result = await this.db.query(
      `SELECT * FROM users WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${index++} OFFSET $${index++}`,
      values
    );
    return result.rows.map(mapUser);
  }

  async softDelete(id: string): Promise<User | null> {
    const now = new Date();
    const result = await this.db.query(
      `UPDATE users SET deleted_at = $1, updated_at = $1 WHERE id = $2 RETURNING *`,
      [now, id]
    );
    if (result.rowCount === 0) return null;
    return mapUser(result.rows[0]);
  }

  async upsertProfile(userId: string, profile: Partial<UserProfile>): Promise<UserProfile> {
    const existing = await this.getProfile(userId);
    const now = new Date();

    if (!existing) {
      const result = await this.db.query(
        `INSERT INTO user_profiles (
            id, user_id, display_name, document_type, document_number, birth_date, phone,
            country_code, address_line1, address_line2, address_city, address_state,
            address_postal_code, address_country, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
          RETURNING *`,
        [
          profile.id,
          userId,
          profile.displayName ?? null,
          profile.documentType ?? null,
          profile.documentNumber ?? null,
          profile.birthDate ?? null,
          profile.phone ?? null,
          profile.countryCode ?? null,
          profile.addressLine1 ?? null,
          profile.addressLine2 ?? null,
          profile.addressCity ?? null,
          profile.addressState ?? null,
          profile.addressPostalCode ?? null,
          profile.addressCountry ?? null,
          now
        ]
      );
      return mapProfile(result.rows[0]);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    const entries: [keyof UserProfile, string][] = [
      ['displayName', 'display_name'],
      ['documentType', 'document_type'],
      ['documentNumber', 'document_number'],
      ['birthDate', 'birth_date'],
      ['phone', 'phone'],
      ['countryCode', 'country_code'],
      ['addressLine1', 'address_line1'],
      ['addressLine2', 'address_line2'],
      ['addressCity', 'address_city'],
      ['addressState', 'address_state'],
      ['addressPostalCode', 'address_postal_code'],
      ['addressCountry', 'address_country']
    ];

    for (const [key, column] of entries) {
      if (profile[key] !== undefined) {
        fields.push(`${column} = $${index++}`);
        values.push(profile[key] ?? null);
      }
    }

    fields.push(`updated_at = $${index++}`);
    values.push(now);
    values.push(existing.id);

    const result = await this.db.query(
      `UPDATE user_profiles SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`,
      values
    );
    return mapProfile(result.rows[0]);
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const result = await this.db.query(`SELECT * FROM user_profiles WHERE user_id = $1`, [userId]);
    if (result.rowCount === 0) return null;
    return mapProfile(result.rows[0]);
  }

  async getRoles(userId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT roles.role_key FROM user_roles
       JOIN roles ON roles.id = user_roles.role_id
       WHERE user_roles.user_id = $1 AND user_roles.deleted_at IS NULL AND roles.deleted_at IS NULL`,
      [userId]
    );
    return result.rows.map((row) => row.role_key as string);
  }

  async assignRole(userId: string, roleKey: string): Promise<void> {
    const now = new Date();
    await this.db.query(
      `INSERT INTO user_roles (id, user_id, role_id, created_at, updated_at)
       SELECT $1, $2, roles.id, $3, $3
       FROM roles
       WHERE roles.role_key = $4 AND roles.deleted_at IS NULL`,
      [uuidv7(), userId, now, roleKey]
    );
  }
}
