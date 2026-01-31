import { DomainError } from './base-error';

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super(
      'Invalid email or password',
      'INVALID_CREDENTIALS',
      401,
      'auth.invalid_credentials'
    );
  }
}

export class EmailNotConfirmedError extends DomainError {
  constructor(email: string) {
    super(
      `Email not confirmed: ${email}`,
      'EMAIL_NOT_CONFIRMED',
      403,
      'auth.email_not_confirmed',
      { email }
    );
  }
}

export class InvalidTokenError extends DomainError {
  constructor(reason?: string) {
    super(
      reason ? `Invalid token: ${reason}` : 'Invalid token',
      'INVALID_TOKEN',
      400,
      'auth.invalid_token',
      reason ? { reason } : undefined
    );
  }
}

export class TokenExpiredError extends DomainError {
  constructor(expiresAt?: Date) {
    super(
      expiresAt ? `Token expired at ${expiresAt.toISOString()}` : 'Token expired',
      'TOKEN_EXPIRED',
      400,
      'auth.token_expired',
      expiresAt ? { expiresAt: expiresAt.toISOString() } : undefined
    );
  }
}

export class TokenAlreadyUsedError extends DomainError {
  constructor(usedAt?: Date) {
    super(
      usedAt ? `Token already used at ${usedAt.toISOString()}` : 'Token already used',
      'TOKEN_ALREADY_USED',
      400,
      'auth.token_already_used',
      usedAt ? { usedAt: usedAt.toISOString() } : undefined
    );
  }
}
