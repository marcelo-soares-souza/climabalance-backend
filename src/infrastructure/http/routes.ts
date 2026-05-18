import { Router, type Handler, type HttpContext } from '../../shared/http/router';
import { createAuthHandlers } from './auth-handlers';
import { createAuditHandlers } from './audit-handlers';
import { createUserHandlers } from './user-handlers';
import { createPrivacyHandlers } from './privacy-handlers';
import { createFootprintHandlers } from './footprint-handlers';
import { createAreaHandlers } from './area-handlers';
import { createUpdateHandlers } from './update-handlers';
import { createCompensationHandlers } from './compensation-handlers';
import { createCertificateHandlers } from './certificate-handlers';
import { createPaymentHandlers } from './payment-handlers';
import { createLocationHandlers } from './location-handlers';
import { createStatsHandlers } from './stats-handlers';
import { createStripeConnectHandlers } from './stripe-connect-handlers';
import { createContactHandlers, type ContactHandlersDeps } from './contact-handlers';
import type { StatsHandlersDeps } from './stats-handlers';
import type { StripeConnectHandlersDeps } from './stripe-connect-handlers';
import { openApiJsonHandler, swaggerUiHandler } from './openapi';
import { withAuth, withCookieCsrf, withOptionalAuth } from './auth';
import type { AuthHandlersDeps } from './auth-handlers';
import type { AuditHandlersDeps } from './audit-handlers';
import type { UserHandlersDeps } from './user-handlers';
import type { PrivacyHandlersDeps } from './privacy-handlers';
import type { FootprintHandlersDeps } from './footprint-handlers';
import type { AreaHandlersDeps } from './area-handlers';
import type { UpdateHandlersDeps } from './update-handlers';
import type { CompensationHandlersDeps } from './compensation-handlers';
import type { CertificateHandlersDeps } from './certificate-handlers';
import type { PaymentHandlersDeps } from './payment-handlers';
import { errorResponse } from '../../shared/http/response';
import { buildLogContext } from '../../shared/http/log-context';
import { env } from '../../shared/utils/env';
import {
  InMemoryRateLimiter,
  withRateLimit,
  withUserRateLimit,
  type RateLimitBucket
} from './rate-limit';

export function buildRouter(
  deps: AuthHandlersDeps &
    UserHandlersDeps &
    AuditHandlersDeps &
    PrivacyHandlersDeps &
    FootprintHandlersDeps &
    AreaHandlersDeps &
    UpdateHandlersDeps &
    CompensationHandlersDeps &
    CertificateHandlersDeps &
    PaymentHandlersDeps &
    StatsHandlersDeps &
    StripeConnectHandlersDeps &
    ContactHandlersDeps
  ): Router {
  const router = new Router();
  const rateLimiter = new InMemoryRateLimiter();
  const authHandlers = createAuthHandlers(deps);
  const auditHandlers = createAuditHandlers(deps);
  const userHandlers = createUserHandlers(deps);
  const privacyHandlers = createPrivacyHandlers(deps);
  const footprintHandlers = createFootprintHandlers(deps);
  const areaHandlers = createAreaHandlers(deps);
  const updateHandlers = createUpdateHandlers(deps);
  const compensationHandlers = createCompensationHandlers(deps);
  const certificateHandlers = createCertificateHandlers(deps);
  const paymentHandlers = createPaymentHandlers(deps);
  const locationHandlers = createLocationHandlers();
  const statsHandlers = createStatsHandlers(deps);
  const stripeConnectHandlers = createStripeConnectHandlers(deps);
  const contactHandlers = createContactHandlers(deps);

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const paymentSimulatorEnabled = env.appEnv === 'local' || env.appEnv === 'test';

  function withAuthOrSelf(handler: Handler): Handler {
    return withAuth(async (ctx: HttpContext) => {
      const rawId = ctx.params.id;
      const isAdmin = ctx.auth?.roles.includes('administrator');

      if (!UUID_REGEX.test(rawId)) {
        const userBySlug = await deps.users.findBySlug(rawId);
        if (userBySlug) {
          ctx.params.id = userBySlug.id;
        }
      }

      if (!isAdmin && ctx.auth?.userId !== ctx.params.id) {
        return errorResponse(403, 'auth.forbidden', undefined, buildLogContext(ctx));
      }
      return handler(ctx);
    });
  }

  const addRoute = (
    method: string,
    path: string,
    bucket: RateLimitBucket,
    handler: Handler
  ) => {
    router.add(
      method,
      path,
      withRateLimit(rateLimiter, { bucket, routeKey: `${method} ${path}` }, handler)
    );
  };

  // API docs routes (disabled in production to avoid exposure)
  if (env.appEnv !== 'production') {
    addRoute('GET', '/api/v1/openapi.json', 'public', (ctx) => openApiJsonHandler(ctx));
    addRoute('GET', '/api/v1/docs', 'public', (ctx) => swaggerUiHandler(ctx));
  }

  // Auth routes
  addRoute('GET', '/api/v1/auth/session', 'auth', (ctx) => authHandlers.sessionBootstrap(ctx));
  addRoute('GET', '/api/v1/auth/human-check', 'auth', (ctx) => authHandlers.humanCheck(ctx));
  addRoute('POST', '/api/v1/auth/register', 'auth', (ctx) => authHandlers.register(ctx));
  addRoute('POST', '/api/v1/auth/login', 'auth', (ctx) => authHandlers.login(ctx));
  addRoute('POST', '/api/v1/auth/confirm-email', 'auth', (ctx) => authHandlers.confirmEmail(ctx));
  addRoute('POST', '/api/v1/auth/confirm-email/resend', 'auth', (ctx) => authHandlers.resendConfirmationEmail(ctx));
  addRoute('POST', '/api/v1/auth/password-reset/request', 'auth', (ctx) => authHandlers.requestPasswordReset(ctx));
  addRoute('POST', '/api/v1/auth/password-reset/confirm', 'auth', (ctx) => authHandlers.resetPassword(ctx));
  addRoute('POST', '/api/v1/users/change-password', 'protected', withUserRateLimit(rateLimiter, { bucket: 'user', routeKey: 'POST /api/v1/users/change-password' }, withAuth((ctx) => authHandlers.changePassword(ctx))));
  addRoute('POST', '/api/v1/auth/refresh', 'auth', withCookieCsrf((ctx) => authHandlers.refresh(ctx)));
  addRoute('POST', '/api/v1/auth/revoke', 'auth', withCookieCsrf((ctx) => authHandlers.revoke(ctx)));
  addRoute('GET', '/api/v1/auth/sessions', 'protected', withAuth((ctx) => authHandlers.listSessions(ctx)));
  addRoute('DELETE', '/api/v1/auth/sessions/:id', 'protected', withAuth((ctx) => authHandlers.revokeSession(ctx)));
  addRoute('DELETE', '/api/v1/auth/sessions', 'protected', withAuth((ctx) => authHandlers.revokeAllSessions(ctx)));

  // User routes
  addRoute('GET', '/api/v1/users', 'admin', withAuth(async (ctx) => userHandlers.list(ctx), { roles: ['administrator'] }));
  addRoute('GET', '/api/v1/directory/users', 'public', async (ctx) => userHandlers.listPublicDirectory(ctx));
  addRoute('GET', '/api/v1/users/:id', 'public', withOptionalAuth((ctx) => userHandlers.get(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/users/:id/profile', 'public', withOptionalAuth((ctx) => userHandlers.getProfile(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/users/:id/climate-balance', 'public', withOptionalAuth((ctx) => userHandlers.getClimateBalance(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/users/:id/contributions', 'public', withOptionalAuth((ctx) => compensationHandlers.listByUser(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/users/:id/compensations', 'public', withOptionalAuth((ctx) => compensationHandlers.listByUser(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/users/:id/certificates', 'public', withOptionalAuth((ctx) => certificateHandlers.listByUser(ctx, ctx.params.id)));
  addRoute('PATCH', '/api/v1/users/:id', 'protected', withAuthOrSelf((ctx) => userHandlers.update(ctx, ctx.params.id)));
  addRoute('DELETE', '/api/v1/users/:id', 'protected', withAuthOrSelf((ctx) => userHandlers.remove(ctx, ctx.params.id)));
  addRoute('PUT', '/api/v1/users/:id/profile', 'protected', withAuthOrSelf((ctx) => userHandlers.createProfile(ctx, ctx.params.id)));
  addRoute('POST', '/api/v1/users/:id/profile/avatar', 'protected', withAuthOrSelf((ctx) => userHandlers.uploadAvatar(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/users/:id/profile/avatar/file', 'media', withOptionalAuth((ctx) => userHandlers.getAvatarFile(ctx, ctx.params.id)));

  // Privacy / GDPR / LGPD routes
  addRoute('GET', '/api/v1/users/:id/data-export', 'protected', withAuthOrSelf((ctx) => privacyHandlers.exportData(ctx, ctx.params.id)));
  addRoute('POST', '/api/v1/privacy/subject-request', 'protected', withAuth((ctx) => privacyHandlers.createSubjectRequest(ctx)));
  addRoute('GET', '/api/v1/privacy/subject-requests', 'protected', withAuth((ctx) => privacyHandlers.listSubjectRequests(ctx)));
  addRoute('POST', '/api/v1/privacy/cookie-consent', 'protected', withAuth((ctx) => privacyHandlers.recordCookieConsent(ctx)));

  // Location routes
  addRoute('GET', '/api/v1/locations/states', 'public', (ctx) => locationHandlers.listStates(ctx));
  addRoute('GET', '/api/v1/locations/cities', 'public', (ctx) => locationHandlers.listCities(ctx));

  // Audit routes
  addRoute('GET', '/api/v1/audit-log', 'admin', withAuth(async (ctx) => auditHandlers.list(ctx), { roles: ['administrator'] }));
  addRoute('POST', '/api/v1/audit-log/verify', 'admin', withAuth(async (ctx) => auditHandlers.verifyChain(ctx), { roles: ['administrator'] }));
  addRoute('GET', '/api/v1/audit-log/export', 'admin', withAuth(async (ctx) => auditHandlers.exportLogs(ctx), { roles: ['administrator'] }));

  // Footprint calculator routes
  addRoute('POST', '/api/v1/footprint/calculations', 'protected', withAuth((ctx) => footprintHandlers.create(ctx)));
  addRoute('PATCH', '/api/v1/footprint/calculations/:id', 'protected', withAuth((ctx) => footprintHandlers.update(ctx, ctx.params.id)));
  addRoute('POST', '/api/v1/footprint/calculations/:id/finalize', 'protected', withAuth((ctx) => footprintHandlers.finalize(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/footprint/calculations/:id', 'protected', withAuth((ctx) => footprintHandlers.get(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/footprint/calculations', 'protected', withAuth((ctx) => footprintHandlers.list(ctx)));
  addRoute('DELETE', '/api/v1/footprint/calculations/:id', 'protected', withAuth((ctx) => footprintHandlers.remove(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/footprint/emission-factors', 'public', (ctx) => footprintHandlers.getEmissionFactors(ctx));
  addRoute('POST', '/api/v1/footprint/calculate-guest', 'public', (ctx) => footprintHandlers.calculateGuest(ctx));
  addRoute('POST', '/api/v1/footprint/calculations/:id/projection', 'protected', withAuth((ctx) => footprintHandlers.createProjection(ctx, ctx.params.id)));

  // Area routes (CRUD)
  addRoute('POST', '/api/v1/areas', 'protected', withAuth((ctx) => areaHandlers.create(ctx), { roles: ['producer', 'administrator'] }));
  addRoute('GET', '/api/v1/areas/:id', 'public', withOptionalAuth((ctx) => areaHandlers.get(ctx, ctx.params.id)));
  addRoute(
    'GET',
    '/api/v1/areas/:id/contributions',
    'public',
    withOptionalAuth((ctx) =>
      compensationHandlers.listByArea(ctx, ctx.params.id)
    )
  );
  addRoute('PATCH', '/api/v1/areas/:id', 'protected', withAuth((ctx) => areaHandlers.update(ctx, ctx.params.id)));
  addRoute('DELETE', '/api/v1/areas/:id', 'protected', withAuth((ctx) => areaHandlers.remove(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/areas', 'public', withOptionalAuth((ctx) => areaHandlers.list(ctx)));

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
  addRoute('GET', '/api/v1/areas/media/:id/file', 'media', withOptionalAuth((ctx) => areaHandlers.getMediaFile(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/areas/media/:id/thumbnail', 'media', withOptionalAuth((ctx) => areaHandlers.getMediaThumbnail(ctx, ctx.params.id)));
  addRoute('DELETE', '/api/v1/areas/media/:id', 'protected', withAuth((ctx) => areaHandlers.deleteMedia(ctx, ctx.params.id), { roles: ['producer', 'administrator'] }));

  // Public map route (no auth required)
  addRoute('GET', '/api/v1/map/areas', 'public', (ctx) => areaHandlers.getForMap(ctx));

  // Tree planting routes
  addRoute('GET', '/api/v1/areas/:id/planted-trees', 'public', (ctx) => areaHandlers.getPlantedTrees(ctx, ctx.params.id));
  addRoute('GET', '/api/v1/areas/:id/pending-tree-count', 'public', (ctx) => areaHandlers.getPendingTreeCount(ctx, ctx.params.id));
  addRoute('POST', '/api/v1/areas/:id/planted-trees', 'protected', withAuth((ctx) => areaHandlers.savePlantedTrees(ctx, ctx.params.id), { roles: ['producer', 'administrator'] }));
  addRoute('DELETE', '/api/v1/areas/:id/planted-trees', 'protected', withAuth((ctx) => areaHandlers.deletePlantedTrees(ctx, ctx.params.id), { roles: ['producer', 'administrator'] }));

  // Satellite image routes
  addRoute('POST', '/api/v1/areas/:id/satellite-image', 'protected', withAuth((ctx) => areaHandlers.fetchSatelliteImage(ctx, ctx.params.id), { roles: ['producer', 'administrator'] }));
  addRoute('GET', '/api/v1/areas/:id/satellite-image/latest', 'public', withOptionalAuth((ctx) => areaHandlers.getLatestSatelliteImage(ctx, ctx.params.id)));
  addRoute('GET', '/api/v1/satellite-images/:imageId/file', 'media', withOptionalAuth((ctx) => areaHandlers.getSatelliteImageFile(ctx, ctx.params.imageId)));
  addRoute('GET', '/api/v1/satellite-images/:imageId/thumbnail', 'media', withOptionalAuth((ctx) => areaHandlers.getSatelliteImageThumbnail(ctx, ctx.params.imageId)));

  // Update/Version routes (public for frontend version checking)
  addRoute('GET', '/api/v1/updates/version', 'public', (ctx) => updateHandlers.getVersion(ctx));
  addRoute('GET', '/api/v1/updates/stream', 'public', (ctx) => updateHandlers.streamUpdates(ctx));
  addRoute('POST', '/api/v1/updates/notify', 'admin', withAuth((ctx) => updateHandlers.notifyUpdate(ctx), { roles: ['administrator'] }));

  // Compensation routes
  addRoute(
    'POST',
    '/api/v1/contributions',
    'protected',
    withUserRateLimit(rateLimiter, { bucket: 'user', routeKey: 'POST /api/v1/contributions' },
      withAuth((ctx) => compensationHandlers.create(ctx))
    )
  );
  addRoute(
    'POST',
    '/api/v1/contributions/quote',
    'protected',
    withUserRateLimit(rateLimiter, { bucket: 'user', routeKey: 'POST /api/v1/contributions/quote' },
      withAuth((ctx) => compensationHandlers.quote(ctx))
    )
  );
  addRoute(
    'GET',
    '/api/v1/contributions',
    'protected',
    withAuth((ctx) => compensationHandlers.listOwn(ctx))
  );
  addRoute(
    'POST',
    '/api/v1/compensations',
    'protected',
    withUserRateLimit(rateLimiter, { bucket: 'user', routeKey: 'POST /api/v1/compensations' },
      withAuth((ctx) => compensationHandlers.create(ctx))
    )
  );
  addRoute(
    'POST',
    '/api/v1/compensations/quote',
    'protected',
    withUserRateLimit(rateLimiter, { bucket: 'user', routeKey: 'POST /api/v1/compensations/quote' },
      withAuth((ctx) => compensationHandlers.quote(ctx))
    )
  );
  addRoute(
    'GET',
    '/api/v1/compensations',
    'protected',
    withAuth((ctx) => compensationHandlers.listOwn(ctx))
  );
  addRoute(
    'GET',
    '/api/v1/certificates/validate',
    'public',
    (ctx) => certificateHandlers.validate(ctx)
  );
  addRoute(
    'GET',
    '/api/v1/certificates/:id/download',
    'protected',
    withAuth((ctx) => certificateHandlers.download(ctx, ctx.params.id))
  );
  if (paymentSimulatorEnabled) {
    addRoute(
      'POST',
      '/api/v1/payments/simulate',
      'protected',
      withAuth((ctx) => paymentHandlers.simulate(ctx))
    );
  }
  addRoute(
    'POST',
    '/api/v1/payments/create-payment-intent',
    'protected',
    withUserRateLimit(rateLimiter, { bucket: 'user', routeKey: 'POST /api/v1/payments/create-payment-intent' },
      withAuth((ctx) => paymentHandlers.createPaymentIntent(ctx), {
        roles: ['individual', 'legal_entity', 'administrator'],
      })
    )
  );
  addRoute('GET', '/api/v1/stats/global', 'public', (ctx) => statsHandlers.global(ctx));

  addRoute(
    'GET',
    '/api/v1/payments/:id/status',
    'protected',
    withAuth((ctx) => paymentHandlers.status(ctx, ctx.params.id))
  );
  addRoute('POST', '/api/v1/payments/webhook', 'public', (ctx) => paymentHandlers.webhook(ctx));
  addRoute(
    'POST',
    '/api/v1/payments/reconcile',
    'admin',
    withAuth((ctx) => paymentHandlers.reconcile(ctx), {
      roles: ['administrator']
    })
  );

  // Stripe Connect routes (producers)
  addRoute(
    'POST',
    '/api/v1/producers/stripe/onboard',
    'protected',
    withAuth((ctx) => stripeConnectHandlers.onboard(ctx), {
      roles: ['producer', 'administrator'],
    })
  );
  addRoute(
    'GET',
    '/api/v1/producers/stripe/status',
    'protected',
    withAuth((ctx) => stripeConnectHandlers.status(ctx), {
      roles: ['producer', 'administrator'],
    })
  );
  addRoute(
    'POST',
    '/api/v1/producers/stripe/dashboard',
    'protected',
    withAuth((ctx) => stripeConnectHandlers.dashboard(ctx), {
      roles: ['producer', 'administrator'],
    })
  );

  // Contact route
  addRoute('POST', '/api/v1/contact', 'protected', withAuth((ctx) => contactHandlers.send(ctx)));

  return router;
}
