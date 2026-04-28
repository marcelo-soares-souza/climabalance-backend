import { getLogger, type LogContext } from '../utils/logger';

export type ApiError = {
  message_key: string;
  details?: unknown;
};

type ResponseHeaders = Headers | Record<string, string> | Array<[string, string]>;

function buildJsonResponseWithHeaders(
  status: number,
  body: unknown,
  extraHeaders?: ResponseHeaders
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}

export function jsonResponse(
  status: number,
  body: unknown,
  context?: LogContext,
  extraHeaders?: ResponseHeaders
): Response {
  if (context) {
    getLogger(context).info('response.payload', { status, body });
  }
  return buildJsonResponseWithHeaders(status, body, extraHeaders);
}

/**
 * Build a Content-Disposition header value that is safe for HTTP (ASCII-only).
 *
 * For clients that support RFC 5987, the international filename is provided
 * via the `filename*` parameter with UTF-8 percent-encoding.
 */
export function contentDispositionHeader(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const safe = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName)
    .replace(/%20/g, ' ');
  return `${disposition}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export function errorResponse(
  status: number,
  messageKey: string,
  details?: unknown,
  context?: LogContext,
  extraHeaders?: ResponseHeaders
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
  return buildJsonResponseWithHeaders(status, payload, extraHeaders);
}
