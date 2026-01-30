export type PasswordResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  sentAt?: Date | null;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export interface PasswordResetRepository {
  create(input: PasswordResetToken): Promise<PasswordResetToken>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markUsed(id: string, usedAt: Date): Promise<PasswordResetToken | null>;
}
