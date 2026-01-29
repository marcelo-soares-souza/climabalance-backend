export type EmailConfirmation = {
  id: string;
  userId: string;
  tokenHash: string;
  sentAt?: Date | null;
  expiresAt: Date;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export interface EmailConfirmationRepository {
  create(input: EmailConfirmation): Promise<EmailConfirmation>;
  findByTokenHash(tokenHash: string): Promise<EmailConfirmation | null>;
  markConfirmed(id: string, confirmedAt: Date): Promise<EmailConfirmation | null>;
}
