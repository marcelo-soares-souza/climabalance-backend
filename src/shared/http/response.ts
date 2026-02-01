import { getLogger, type LogContext } from '../utils/logger';

export type ApiError = {
  message_key: string;
  details?: unknown;
};

function buildJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

export function jsonResponse(status: number, body: unknown, context?: LogContext): Response {
  if (context) {
    getLogger(context).info('response.payload', { status, body });
  }
  return buildJsonResponse(status, body);
}

export function errorResponse(
  status: number,
  messageKey: string,
  details?: unknown,
  context?: LogContext
): Response {
  const error: ApiError = { message_key: messageKey };
  if (details !== undefined) {
    error.details = details;
  }
  const payload = { error };
  if (context) {
    getLogger(context).warn('response.error', {
      status,
      message_key: messageKey,
      details,
      payload
    });
  }
  return buildJsonResponse(status, payload);
}
