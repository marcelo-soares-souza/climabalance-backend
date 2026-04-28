import type { User, UserProfile } from './user';

export type CreateUserInput = {
  id: string;
  email: string;
  passwordHash: string;
  status: 'active' | 'pending' | 'suspended';
  locale: string;
  emailConfirmedAt?: Date | null;
};

export type UpdateUserInput = {
  id: string;
  email?: string;
  passwordHash?: string;
  status?: 'active' | 'pending' | 'suspended';
  locale?: string;
  emailConfirmedAt?: Date | null;
  deletedAt?: Date | null;
};

export type UserFilters = {
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  update(input: UpdateUserInput): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(filters: UserFilters): Promise<User[]>;
  softDelete(id: string): Promise<User | null>;
  updateLastLogin(userId: string, timestamp: Date): Promise<void>;
  upsertProfile(userId: string, profile: Partial<UserProfile>): Promise<UserProfile>;
  getProfile(userId: string): Promise<UserProfile | null>;
  getRoles(userId: string): Promise<string[]>;
  getRolesByUserIds?(userIds: string[]): Promise<Record<string, string[]>>;
  assignRole(userId: string, roleKey: string): Promise<void>;
}
