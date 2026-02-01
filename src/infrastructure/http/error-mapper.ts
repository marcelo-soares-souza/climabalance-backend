import { errorResponse } from '../../shared/http/response';
import type { ReturnTypeLogger, LogContext } from '../../shared/utils/logger';
import { getLogger } from '../../shared/utils/logger';
import { DomainError } from '../../domain/errors';

function resolveLogger(logger?: ReturnTypeLogger, context?: LogContext) {
  return logger ?? getLogger(context);
}

export function handleError(
  error: unknown,
  logger?: ReturnTypeLogger,
  context?: LogContext
): Response {
  const log = resolveLogger(logger, context);

  // Handle DomainError instances (new pattern)
  if (error instanceof DomainError) {
    const status = error.httpStatus;
    const response = errorResponse(status, error.i18nKey, error.metadata, context);

    if (status >= 500) {
      log.error('request.failed', { error: error.code, message: error.message, metadata: error.metadata });
    } else {
      log.warn('request.rejected', { error: error.code, status, metadata: error.metadata });
    }

    return response;
  }

  // Handle database errors specifically
  if (error instanceof Error && 'code' in error) {
    const dbError = error as Error & { code?: string; detail?: string; constraint?: string };
    const dbCode = dbError.code;

    // PostgreSQL error codes
    if (dbCode) {
      log.error('database.error', {
        code: dbCode,
        message: dbError.message,
        detail: dbError.detail,
        constraint: dbError.constraint,
        stack: dbError.stack
      });

      // Connection errors
      if (dbCode.startsWith('08') || dbCode === 'ECONNREFUSED' || dbCode === 'ENOTFOUND') {
        return errorResponse(503, 'database.connection_error', undefined, context);
      }

      // Constraint violations
      if (dbCode === '23505') {
        return errorResponse(409, 'database.unique_violation', undefined, context);
      }
      if (dbCode === '23503') {
        return errorResponse(409, 'database.foreign_key_violation', undefined, context);
      }

      // Generic database error
      return errorResponse(500, 'database.error', undefined, context);
    }
  }

  // Handle legacy string-based errors (backward compatibility)
  const message = error instanceof Error ? error.message : 'unexpected_error';
  let status = 500;
  let response: Response;

  switch (message) {
    case 'invalid_content_type':
      status = 415;
      response = errorResponse(415, 'request.invalid_content_type', undefined, context);
      break;
    case 'payload_too_large':
      status = 413;
      response = errorResponse(413, 'request.payload_too_large', undefined, context);
      break;
    case 'validation_failed':
      status = 400;
      response = errorResponse(400, 'request.validation_failed', undefined, context);
      break;
    case 'email_already_exists':
      status = 409;
      response = errorResponse(409, 'user.email_already_exists', undefined, context);
      break;
    case 'user_not_found':
      status = 404;
      response = errorResponse(404, 'user.not_found', undefined, context);
      break;
    case 'invalid_credentials':
      status = 401;
      response = errorResponse(401, 'auth.invalid_credentials', undefined, context);
      break;
    case 'email_not_confirmed':
      status = 403;
      response = errorResponse(403, 'auth.email_not_confirmed', undefined, context);
      break;
    case 'user_not_active':
      status = 403;
      response = errorResponse(403, 'auth.user_not_active', undefined, context);
      break;
    case 'invalid_token':
      status = 400;
      response = errorResponse(400, 'auth.invalid_token', undefined, context);
      break;
    case 'token_expired':
      status = 400;
      response = errorResponse(400, 'auth.token_expired', undefined, context);
      break;
    case 'token_already_used':
      status = 400;
      response = errorResponse(400, 'auth.token_already_used', undefined, context);
      break;
    default:
      status = 500;
      response = errorResponse(500, 'server.error', undefined, context);
      break;
  }

  if (status >= 500) {
    log.error('request.failed', { error: message });
  } else {
    log.warn('request.rejected', { error: message, status });
  }

  return response;
}
