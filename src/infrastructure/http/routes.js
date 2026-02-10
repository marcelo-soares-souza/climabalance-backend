import { Router } from '../../shared/http/router';
import { createAuthHandlers } from './auth-handlers';
import { createAuditHandlers } from './audit-handlers';
import { createUserHandlers } from './user-handlers';
import { createFootprintHandlers } from './footprint-handlers';
import { createAreaHandlers } from './area-handlers';
import { createUpdateHandlers } from './update-handlers';
import { createCompensationHandlers } from './compensation-handlers';
import { createCertificateHandlers } from './certificate-handlers';
import { withAuth, withOptionalAuth } from './auth';
import { errorResponse } from '../../shared/http/response';
import { buildLogContext } from '../../shared/http/log-context';
import { InMemoryRateLimiter, withRateLimit } from './rate-limit';
function withAuthOrSelf(handler) {
    return withAuth(async (ctx) => {
        const userId = ctx.params.id;
        const isAdmin = ctx.auth?.roles.includes('administrator');
        if (!isAdmin && ctx.auth?.userId !== userId) {
            return errorResponse(403, 'auth.forbidden', undefined, buildLogContext(ctx));
        }
        return handler(ctx);
    });
}
export function buildRouter(deps) {
    const router = new Router();
    const rateLimiter = new InMemoryRateLimiter();
    const authHandlers = createAuthHandlers(deps);
    const auditHandlers = createAuditHandlers(deps);
    const userHandlers = createUserHandlers(deps);
    const footprintHandlers = createFootprintHandlers(deps);
    const areaHandlers = createAreaHandlers(deps);
    const updateHandlers = createUpdateHandlers(deps);
    const compensationHandlers = createCompensationHandlers(deps);
    const certificateHandlers = createCertificateHandlers(deps);
    const addRoute = (method, path, bucket, handler) => {
        router.add(method, path, withRateLimit(rateLimiter, { bucket, routeKey: `${method} ${path}` }, handler));
    };
    // Auth routes
    addRoute('POST', '/api/v1/auth/register', 'auth', (ctx) => authHandlers.register(ctx));
    addRoute('POST', '/api/v1/auth/login', 'auth', (ctx) => authHandlers.login(ctx));
    addRoute('POST', '/api/v1/auth/confirm-email', 'auth', (ctx) => authHandlers.confirmEmail(ctx));
    addRoute('POST', '/api/v1/auth/confirm-email/resend', 'auth', (ctx) => authHandlers.resendConfirmationEmail(ctx));
    addRoute('POST', '/api/v1/auth/password-reset/request', 'auth', (ctx) => authHandlers.requestPasswordReset(ctx));
    addRoute('POST', '/api/v1/auth/password-reset/confirm', 'auth', (ctx) => authHandlers.resetPassword(ctx));
    addRoute('POST', '/api/v1/auth/refresh', 'auth', (ctx) => authHandlers.refresh(ctx));
    addRoute('POST', '/api/v1/auth/revoke', 'protected', withAuth((ctx) => authHandlers.revoke(ctx)));
    // User routes
    addRoute('GET', '/api/v1/users', 'admin', withAuth(async (ctx) => userHandlers.list(ctx), { roles: ['administrator'] }));
    addRoute('GET', '/api/v1/users/:id', 'protected', withAuthOrSelf((ctx) => userHandlers.get(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/users/:id/profile', 'protected', withAuthOrSelf((ctx) => userHandlers.getProfile(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/users/:id/compensations', 'protected', withAuthOrSelf((ctx) => compensationHandlers.listByUser(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/users/:id/certificates', 'protected', withAuthOrSelf((ctx) => certificateHandlers.listByUser(ctx, ctx.params.id)));
    addRoute('PATCH', '/api/v1/users/:id', 'protected', withAuthOrSelf((ctx) => userHandlers.update(ctx, ctx.params.id)));
    addRoute('DELETE', '/api/v1/users/:id', 'protected', withAuthOrSelf((ctx) => userHandlers.remove(ctx, ctx.params.id)));
    addRoute('PUT', '/api/v1/users/:id/profile', 'protected', withAuthOrSelf((ctx) => userHandlers.createProfile(ctx, ctx.params.id)));
    // Audit routes
    addRoute('GET', '/api/v1/audit-log', 'admin', withAuth(async (ctx) => auditHandlers.list(ctx), { roles: ['administrator'] }));
    // Footprint calculator routes
    addRoute('POST', '/api/v1/footprint/calculations', 'protected', withAuth((ctx) => footprintHandlers.create(ctx)));
    addRoute('PATCH', '/api/v1/footprint/calculations/:id', 'protected', withAuth((ctx) => footprintHandlers.update(ctx, ctx.params.id)));
    addRoute('POST', '/api/v1/footprint/calculations/:id/finalize', 'protected', withAuth((ctx) => footprintHandlers.finalize(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/footprint/calculations/:id', 'protected', withAuth((ctx) => footprintHandlers.get(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/footprint/calculations', 'protected', withAuth((ctx) => footprintHandlers.list(ctx)));
    addRoute('DELETE', '/api/v1/footprint/calculations/:id', 'protected', withAuth((ctx) => footprintHandlers.remove(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/footprint/emission-factors', 'public', (ctx) => footprintHandlers.getEmissionFactors(ctx));
    addRoute('POST', '/api/v1/footprint/calculations/:id/projection', 'protected', withAuth((ctx) => footprintHandlers.createProjection(ctx, ctx.params.id)));
    // Area routes (CRUD)
    addRoute('POST', '/api/v1/areas', 'protected', withAuth((ctx) => areaHandlers.create(ctx), { roles: ['producer', 'administrator'] }));
    addRoute('GET', '/api/v1/areas/:id', 'public', withOptionalAuth((ctx) => areaHandlers.get(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/areas/:id/contributions', 'public', withOptionalAuth((ctx) => compensationHandlers.listByArea(ctx, ctx.params.id)));
    addRoute('PATCH', '/api/v1/areas/:id', 'protected', withAuth((ctx) => areaHandlers.update(ctx, ctx.params.id)));
    addRoute('DELETE', '/api/v1/areas/:id', 'protected', withAuth((ctx) => areaHandlers.remove(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/areas', 'protected', withAuth((ctx) => areaHandlers.list(ctx)));
    // Area audit workflow routes
    addRoute('POST', '/api/v1/areas/:id/submit-audit', 'protected', withAuth((ctx) => areaHandlers.submitForAudit(ctx, ctx.params.id)));
    addRoute('POST', '/api/v1/areas/:id/approve', 'admin', withAuth((ctx) => areaHandlers.approve(ctx, ctx.params.id), { roles: ['analyst', 'administrator'] }));
    addRoute('POST', '/api/v1/areas/:id/reject', 'admin', withAuth((ctx) => areaHandlers.reject(ctx, ctx.params.id), { roles: ['analyst', 'administrator'] }));
    addRoute('POST', '/api/v1/areas/:id/activate', 'admin', withAuth((ctx) => areaHandlers.activate(ctx, ctx.params.id), { roles: ['analyst', 'administrator'] }));
    addRoute('POST', '/api/v1/areas/:id/suspend', 'admin', withAuth((ctx) => areaHandlers.suspend(ctx, ctx.params.id), { roles: ['administrator'] }));
    // Area capacity route
    addRoute('GET', '/api/v1/areas/:id/capacity', 'protected', withAuth((ctx) => areaHandlers.getCapacity(ctx, ctx.params.id)));
    addRoute('POST', '/api/v1/areas/:id/media', 'protected', withAuth((ctx) => areaHandlers.uploadMedia(ctx, ctx.params.id), { roles: ['producer', 'administrator'] }));
    addRoute('GET', '/api/v1/areas/:id/media', 'public', withOptionalAuth((ctx) => areaHandlers.listMedia(ctx, ctx.params.id)));
    addRoute('GET', '/api/v1/areas/media/:id/file', 'public', withOptionalAuth((ctx) => areaHandlers.getMediaFile(ctx, ctx.params.id)));
    addRoute('DELETE', '/api/v1/areas/media/:id', 'protected', withAuth((ctx) => areaHandlers.deleteMedia(ctx, ctx.params.id), { roles: ['producer', 'administrator'] }));
    // Public map route (no auth required)
    addRoute('GET', '/api/v1/map/areas', 'public', (ctx) => areaHandlers.getForMap(ctx));
    // Update/Version routes (public for frontend version checking)
    addRoute('GET', '/api/v1/updates/version', 'public', (ctx) => updateHandlers.getVersion(ctx));
    addRoute('GET', '/api/v1/updates/stream', 'public', (ctx) => updateHandlers.streamUpdates(ctx));
    addRoute('POST', '/api/v1/updates/notify', 'admin', withAuth((ctx) => updateHandlers.notifyUpdate(ctx), { roles: ['administrator'] }));
    // Compensation routes
    addRoute('POST', '/api/v1/compensations', 'protected', withAuth((ctx) => compensationHandlers.create(ctx)));
    addRoute('POST', '/api/v1/compensations/quote', 'protected', withAuth((ctx) => compensationHandlers.quote(ctx)));
    addRoute('GET', '/api/v1/compensations', 'protected', withAuth((ctx) => compensationHandlers.listOwn(ctx)));
    addRoute('GET', '/api/v1/certificates/validate', 'public', (ctx) => certificateHandlers.validate(ctx));
    addRoute('GET', '/api/v1/certificates/:id/download', 'protected', withAuth((ctx) => certificateHandlers.download(ctx, ctx.params.id)));
    return router;
}
