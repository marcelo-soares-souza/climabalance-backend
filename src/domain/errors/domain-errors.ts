import { DomainError } from './base-error';

export class EmailAlreadyExistsError extends DomainError {
  constructor(email: string) {
    super(
      `Email already exists: ${email}`,
      'EMAIL_ALREADY_EXISTS',
      409,
      'user.email_already_exists',
      { email }
    );
  }
}

export class UserNotFoundError extends DomainError {
  constructor(identifier?: string) {
    super(
      identifier ? `User not found: ${identifier}` : 'User not found',
      'USER_NOT_FOUND',
      404,
      'user.not_found',
      identifier ? { identifier } : undefined
    );
  }
}

export class UserNotActiveError extends DomainError {
  constructor(userId: string) {
    super(
      `User is not active: ${userId}`,
      'USER_NOT_ACTIVE',
      403,
      'auth.user_not_active',
      { userId }
    );
  }
}
