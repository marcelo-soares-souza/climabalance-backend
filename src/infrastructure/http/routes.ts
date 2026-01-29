import { Router, type Handler, type HttpContext } from '../../shared/http/router';
import { createAuthHandlers } from './auth-handlers';
import { createUserHandlers } from './user-handlers';
import { withAuth } from './auth';
import type { AuthHandlersDeps } from './auth-handlers';
import type { UserHandlersDeps } from './user-handlers';
import { errorResponse } from '../../shared/http/response';

function withAuthOrSelf(handler: Handler): Handler {
  return withAuth(async (ctx: HttpContext) => {
    const userId = ctx.params.id;
    const isAdmin = ctx.auth?.roles.includes('administrator');
    if (!isAdmin && ctx.auth?.userId !== userId) {
      return errorResponse(403, 'auth.forbidden');
    }
    return handler(ctx);
  });
}

export function buildRouter(deps: AuthHandlersDeps & UserHandlersDeps): Router {
  const router = new Router();
  const authHandlers = createAuthHandlers(deps);
  const userHandlers = createUserHandlers(deps);

  router.add('POST', '/api/v1/auth/register', (ctx) => authHandlers.register(ctx));
  router.add('POST', '/api/v1/auth/login', (ctx) => authHandlers.login(ctx));
  router.add('POST', '/api/v1/auth/confirm-email', (ctx) => authHandlers.confirmEmail(ctx));

  router.add('GET', '/api/v1/users', withAuth(async (ctx) => userHandlers.list(ctx), { roles: ['administrator'] }));
  router.add('GET', '/api/v1/users/:id', withAuthOrSelf((ctx) => userHandlers.get(ctx, ctx.params.id)));
  router.add('PATCH', '/api/v1/users/:id', withAuthOrSelf((ctx) => userHandlers.update(ctx, ctx.params.id)));
  router.add('DELETE', '/api/v1/users/:id', withAuth(async (ctx) => userHandlers.remove(ctx, ctx.params.id), { roles: ['administrator'] }));
  router.add('PUT', '/api/v1/users/:id/profile', withAuthOrSelf((ctx) => userHandlers.createProfile(ctx, ctx.params.id)));

  return router;
}
