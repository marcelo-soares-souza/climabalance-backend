import { getLogger } from '../utils/logger';
function buildJsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json'
        }
    });
}
export function jsonResponse(status, body, context) {
    if (context) {
        getLogger(context).info('response.payload', { status, body });
    }
    return buildJsonResponse(status, body);
}
export function errorResponse(status, messageKey, details, context) {
    const error = { message_key: messageKey };
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
