export function buildLogContext(ctx) {
    return {
        requestId: ctx.requestId,
        userId: ctx.auth?.userId,
        clientIp: ctx.clientIp
    };
}
