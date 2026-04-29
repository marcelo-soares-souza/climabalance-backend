export type RefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  fingerprintHash?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export interface RefreshTokenRepository {
  create(input: RefreshToken): Promise<RefreshToken>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  findActiveByUserId(userId: string): Promise<RefreshToken[]>;
  revoke(id: string, revokedAt: Date): Promise<void>;
  revokeAllByUserId(userId: string, revokedAt: Date): Promise<void>;
}
