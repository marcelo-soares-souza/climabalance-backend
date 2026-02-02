import { Router, type Handler, type HttpContext } from '../../shared/http/router';
import { createAuthHandlers } from './auth-handlers';
import { createAuditHandlers } from './audit-handlers';
import { createUserHandlers } from './user-handlers';
import { createFootprintHandlers } from './footprint-handlers';
import { createAreaHandlers } from './area-handlers';
import { withAuth, withOptionalAuth } from './auth';
import type { AuthHandlersDeps } from './auth-handlers';
import type { AuditHandlersDeps } from './audit-handlers';
import type { UserHandlersDeps } from './user-handlers';
import type { FootprintHandlersDeps } from './footprint-handlers';
import type { AreaHandlersDeps } from './area-handlers';
import { errorResponse } from '../../shared/http/response';
import { buildLogContext } from '../../shared/http/log-context';

function withAuthOrSelf(handler: Handler): Handler {
  return withAuth(async (ctx: HttpContext) => {
    const userId = ctx.params.id;
    const isAdmin = ctx.auth?.roles.includes('administrator');
    if (!isAdmin && ctx.auth?.userId !== userId) {
      return errorResponse(403, 'auth.forbidden', undefined, buildLogContext(ctx));
    }
    return handler(ctx);
  });
}

export function buildRouter(deps: AuthHandlersDeps & UserHandlersDeps & AuditHandlersDeps & FootprintHandlersDeps & AreaHandlersDeps): Router {
  const router = new Router();
  const authHandlers = createAuthHandlers(deps);
  const auditHandlers = createAuditHandlers(deps);
  const userHandlers = createUserHandlers(deps);
  const footprintHandlers = createFootprintHandlers(deps);
  const areaHandlers = createAreaHandlers(deps);

  // Auth routes
  router.add('POST', '/api/v1/auth/register', (ctx) => authHandlers.register(ctx));
  router.add('POST', '/api/v1/auth/login', (ctx) => authHandlers.login(ctx));
  router.add('POST', '/api/v1/auth/confirm-email', (ctx) => authHandlers.confirmEmail(ctx));
  router.add('POST', '/api/v1/auth/confirm-email/resend', (ctx) => authHandlers.resendConfirmationEmail(ctx));
  router.add('POST', '/api/v1/auth/password-reset/request', (ctx) => authHandlers.requestPasswordReset(ctx));
  router.add('POST', '/api/v1/auth/password-reset/confirm', (ctx) => authHandlers.resetPassword(ctx));

  // User routes
  router.add('GET', '/api/v1/users', withAuth(async (ctx) => userHandlers.list(ctx), { roles: ['administrator'] }));
  router.add('GET', '/api/v1/users/:id', withAuthOrSelf((ctx) => userHandlers.get(ctx, ctx.params.id)));
  router.add('GET', '/api/v1/users/:id/profile', withAuthOrSelf((ctx) => userHandlers.getProfile(ctx, ctx.params.id)));
  router.add('PATCH', '/api/v1/users/:id', withAuthOrSelf((ctx) => userHandlers.update(ctx, ctx.params.id)));
  router.add('DELETE', '/api/v1/users/:id', withAuthOrSelf((ctx) => userHandlers.remove(ctx, ctx.params.id)));
  router.add('PUT', '/api/v1/users/:id/profile', withAuthOrSelf((ctx) => userHandlers.createProfile(ctx, ctx.params.id)));

  // Audit routes
  router.add('GET', '/api/v1/audit-log', withAuth(async (ctx) => auditHandlers.list(ctx), { roles: ['administrator'] }));

  // Footprint calculator routes
  router.add('POST', '/api/v1/footprint/calculations', withAuth((ctx) => footprintHandlers.create(ctx)));
  router.add('PATCH', '/api/v1/footprint/calculations/:id', withAuth((ctx) => footprintHandlers.update(ctx, ctx.params.id)));
  router.add('POST', '/api/v1/footprint/calculations/:id/finalize', withAuth((ctx) => footprintHandlers.finalize(ctx, ctx.params.id)));
  router.add('GET', '/api/v1/footprint/calculations/:id', withAuth((ctx) => footprintHandlers.get(ctx, ctx.params.id)));
  router.add('GET', '/api/v1/footprint/calculations', withAuth((ctx) => footprintHandlers.list(ctx)));
  router.add('DELETE', '/api/v1/footprint/calculations/:id', withAuth((ctx) => footprintHandlers.remove(ctx, ctx.params.id)));
  router.add('GET', '/api/v1/footprint/emission-factors', (ctx) => footprintHandlers.getEmissionFactors(ctx));
  router.add('POST', '/api/v1/footprint/calculations/:id/projection', withAuth((ctx) => footprintHandlers.createProjection(ctx, ctx.params.id)));

  // Area routes (CRUD)
  router.add('POST', '/api/v1/areas', withAuth((ctx) => areaHandlers.create(ctx), { roles: ['producer', 'administrator'] }));
  router.add('GET', '/api/v1/areas/:id', withOptionalAuth((ctx) => areaHandlers.get(ctx, ctx.params.id)));
  router.add('PATCH', '/api/v1/areas/:id', withAuth((ctx) => areaHandlers.update(ctx, ctx.params.id)));
  router.add('DELETE', '/api/v1/areas/:id', withAuth((ctx) => areaHandlers.remove(ctx, ctx.params.id)));
  router.add('GET', '/api/v1/areas', withAuth((ctx) => areaHandlers.list(ctx)));

  // Area audit workflow routes
  router.add('POST', '/api/v1/areas/:id/submit-audit', withAuth((ctx) => areaHandlers.submitForAudit(ctx, ctx.params.id)));
  router.add('POST', '/api/v1/areas/:id/approve', withAuth((ctx) => areaHandlers.approve(ctx, ctx.params.id), { roles: ['analyst', 'administrator'] }));
  router.add('POST', '/api/v1/areas/:id/reject', withAuth((ctx) => areaHandlers.reject(ctx, ctx.params.id), { roles: ['analyst', 'administrator'] }));
  router.add('POST', '/api/v1/areas/:id/activate', withAuth((ctx) => areaHandlers.activate(ctx, ctx.params.id), { roles: ['analyst', 'administrator'] }));
  router.add('POST', '/api/v1/areas/:id/suspend', withAuth((ctx) => areaHandlers.suspend(ctx, ctx.params.id), { roles: ['administrator'] }));

  // Area capacity route
  router.add('GET', '/api/v1/areas/:id/capacity', withAuth((ctx) => areaHandlers.getCapacity(ctx, ctx.params.id)));

  // Public map route (no auth required)
  router.add('GET', '/api/v1/map/areas', (ctx) => areaHandlers.getForMap(ctx));

  return router;
}
