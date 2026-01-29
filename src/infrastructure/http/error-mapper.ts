import { errorResponse } from '../../shared/http/response';
import type { ReturnTypeLogger } from '../../shared/utils/logger';
import { getLogger } from '../../shared/utils/logger';

function resolveLogger(logger?: ReturnTypeLogger) {
  return logger ?? getLogger();
}

export function handleError(error: unknown, logger?: ReturnTypeLogger): Response {
  const message = error instanceof Error ? error.message : 'unexpected_error';
  let status = 500;
  let response: Response;

  switch (message) {
    case 'invalid_content_type':
      status = 415;
      response = errorResponse(415, 'request.invalid_content_type');
      break;
    case 'payload_too_large':
      status = 413;
      response = errorResponse(413, 'request.payload_too_large');
      break;
    case 'validation_failed':
      status = 400;
      response = errorResponse(400, 'request.validation_failed');
      break;
    case 'email_already_exists':
      status = 409;
      response = errorResponse(409, 'user.email_already_exists');
      break;
    case 'user_not_found':
      status = 404;
      response = errorResponse(404, 'user.not_found');
      break;
    case 'invalid_credentials':
      status = 401;
      response = errorResponse(401, 'auth.invalid_credentials');
      break;
    case 'email_not_confirmed':
      status = 403;
      response = errorResponse(403, 'auth.email_not_confirmed');
      break;
    case 'user_not_active':
      status = 403;
      response = errorResponse(403, 'auth.user_not_active');
      break;
    case 'invalid_token':
      status = 400;
      response = errorResponse(400, 'auth.invalid_token');
      break;
    case 'token_expired':
      status = 400;
      response = errorResponse(400, 'auth.token_expired');
      break;
    case 'token_already_used':
      status = 400;
      response = errorResponse(400, 'auth.token_already_used');
      break;
    default:
      status = 500;
      response = errorResponse(500, 'server.error');
      break;
  }

  const log = resolveLogger(logger);
  if (status >= 500) {
    log.error('request.failed', { error: message });
  } else {
    log.warn('request.rejected', { error: message, status });
  }

  return response;
}
