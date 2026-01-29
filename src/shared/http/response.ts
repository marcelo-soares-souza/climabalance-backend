export type ApiError = {
  message_key: string;
  details?: unknown;
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

export function errorResponse(status: number, messageKey: string, details?: unknown): Response {
  const error: ApiError = { message_key: messageKey };
  if (details !== undefined) {
    error.details = details;
  }
  return jsonResponse(status, { error });
}
