import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { PasswordResetRepository } from '../../domain/user/password-reset-repository';
import type { RefreshTokenRepository } from '../../domain/user/refresh-token-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordHasher } from '../crypto/password';
import type { EmailSender } from '../email/email-sender';
import type { UnitOfWork } from '../persistence/unit-of-work';
import type { TokenGenerator } from '../../domain/services/token-generator';
import type { JwtService } from '../../domain/services/jwt-service';
import type { HashService } from '../../domain/services/hash-service';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import type { Config } from '../../domain/services/config';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { JobQueue } from '../../domain/jobs/job-queue';
import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { authenticateUser } from '../../application/auth/authenticate-user';
import { refreshAccessToken } from '../../application/auth/refresh-access-token';
import { revokeRefreshToken } from '../../application/auth/revoke-refresh-token';
import { confirmEmail } from '../../application/auth/confirm-email';
import { registerUser } from '../../application/auth/register-user';
import { resendConfirmationEmail } from '../../application/auth/resend-confirmation-email';
import { requestPasswordReset } from '../../application/auth/request-password-reset';
import { resetPassword } from '../../application/auth/reset-password';
import { changePassword } from '../../application/auth/change-password';
import { getLogger } from '../../shared/utils/logger';
import {
  registerSchema,
  loginSchema,
  confirmEmailSchema,
  resendConfirmationSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  parseWithSchema
} from './schemas';
import { refreshTokenSchema, revokeTokenSchema, changePasswordSchema } from './schemas/auth-schemas';
import { buildLogContext } from '../../shared/http/log-context';
import { createHumanCheckChallenge, resolveHumanCheckLocale, verifyHumanCheckChallenge } from './human-check';
import { checkLoginLockout, recordLoginAttempt } from './rate-limit';
import {
  buildRefreshTokenCookie,
  buildRefreshTokenCookieCleared,
  getRefreshTokenFromCookie,
} from '../../shared/http/cookies';

const authResponseHeaders = {
  'cache-control': 'no-store',
  pragma: 'no-cache',
};

function withRefreshCookie(refreshToken: string, maxAgeSeconds: number): Record<string, string> {
  return {
    ...authResponseHeaders,
    'set-cookie': buildRefreshTokenCookie(refreshToken, maxAgeSeconds),
  };
}

function clearRefreshCookieHeaders(): Record<string, string> {
  return {
    ...authResponseHeaders,
    'set-cookie': buildRefreshTokenCookieCleared(),
  };
}

export type AuthHandlersDeps = {
  users: UserRepository;
  confirmations: EmailConfirmationRepository;
  passwordResets: PasswordResetRepository;
  refreshTokens: RefreshTokenRepository;
  auditLog: Pick<AuditLogRepository, 'log'>;
  passwordHasher: PasswordHasher;
  emailSender: EmailSender;
  unitOfWork: UnitOfWork;
  tokenGenerator: TokenGenerator;
  jwtService: JwtService;
  hashService: HashService;
  idGenerator: IdGenerator;
  clock: Clock;
  config: Config;
  jobQueue: JobQueue;
};

export function createAuthHandlers(deps: AuthHandlersDeps) {
  return {
    humanCheck: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const locale = resolveHumanCheckLocale({
          queryLocale: ctx.query.get('locale'),
          acceptLanguage: ctx.request.headers.get('accept-language'),
        });
        const challenge = await createHumanCheckChallenge(
          { locale },
          {
            jwtService: deps.jwtService,
            jwtSecret: deps.config.jwtSecret,
            tokenGenerator: deps.tokenGenerator,
            now: deps.clock.now(),
          }
        );
        log.info('auth.human_check.created', { locale: challenge.locale });
        return jsonResponse(
          200,
          {
            data: {
              challenge_id: challenge.challengeId,
              question: challenge.question,
              locale: challenge.locale,
            },
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    register: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(registerSchema, body);
        const isHuman = await verifyHumanCheckChallenge(
          {
            challengeId: validated.human_challenge_id,
            answer: validated.human_answer,
          },
          {
            jwtService: deps.jwtService,
            jwtSecret: deps.config.jwtSecret,
          }
        );
        if (!isHuman) {
          return errorResponse(400, 'auth.register.humanCheckInvalid', undefined, logContext);
        }

        const result = await registerUser(
          {
            email: validated.email,
            password: validated.password,
            locale: validated.locale,
            roleKey: validated.role_key,
            displayName: validated.name
          },
          {
            users: deps.users,
            confirmations: deps.confirmations,
            passwordHasher: deps.passwordHasher,
            emailSender: deps.emailSender,
            unitOfWork: deps.unitOfWork,
            tokenGenerator: deps.tokenGenerator,
            hashService: deps.hashService,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            config: deps.config
          }
        );

        log.info('auth.register.created', { user_id: result.id, email: result.email });

        await deps.jobQueue.enqueue('user.registered', {
          email: result.email,
          roleKey: validated.role_key ?? 'individual',
        }).catch(() => {});

        return jsonResponse(
          201,
          {
            data: result,
            message_key: 'auth.registration_pending_confirmation'
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    login: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(loginSchema, body);
        const fingerprint = ctx.request.headers.get('x-device-fingerprint') || undefined;
        const userAgent = ctx.request.headers.get('user-agent') || undefined;

        const lockout = await checkLoginLockout(validated.email);
        if (lockout.blocked) {
          log.warn('auth.login.locked', { email: validated.email });
          return errorResponse(429, 'auth.login.locked', { retry_after_seconds: lockout.retryAfterSeconds }, logContext);
        }

        log.debug('auth.login.attempt', { email: validated.email });
        let userId: string;
        let token: any;
        try {
          const result = await authenticateUser(
            {
              email: validated.email,
              password: validated.password,
              fingerprint,
              userAgent,
            },
            {
              users: deps.users,
              refreshTokens: deps.refreshTokens,
              passwordHasher: deps.passwordHasher,
              jwtService: deps.jwtService,
              hashService: deps.hashService,
              tokenGenerator: deps.tokenGenerator,
              idGenerator: deps.idGenerator,
              clock: deps.clock,
              config: deps.config
            }
          );
          userId = result.userId;
          token = result;
          await recordLoginAttempt(validated.email, true);
        } catch (error) {
          await recordLoginAttempt(validated.email, false);
          throw error;
        }

        await deps.auditLog.log({
          actorUserId: userId,
          action: 'user.login',
          entityType: 'user',
          entityId: userId,
          ctx,
          success: true,
          httpStatus: 200,
          severity: 'info',
          category: ['security'],
        });

        log.info('auth.login.success', { email: validated.email });
        return jsonResponse(
          200,
          {
            data: {
              accessToken: token.accessToken,
              tokenType: token.tokenType,
              expiresIn: token.expiresIn,
              refreshExpiresIn: token.refreshExpiresIn,
            },
          },
          logContext,
          withRefreshCookie(token.refreshToken, token.refreshExpiresIn)
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    confirmEmail: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(confirmEmailSchema, body);

        const result = await confirmEmail(validated.token, {
          confirmations: deps.confirmations,
          users: deps.users,
          hashService: deps.hashService,
          clock: deps.clock
        });
        log.info('auth.confirm.success', { user_id: result.userId });
        return jsonResponse(200, { message_key: 'auth.email_confirmed' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    resendConfirmationEmail: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(resendConfirmationSchema, body);

        await resendConfirmationEmail(
          { email: validated.email },
          {
            users: deps.users,
            confirmations: deps.confirmations,
            emailSender: deps.emailSender,
            tokenGenerator: deps.tokenGenerator,
            hashService: deps.hashService,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            config: deps.config
          }
        );

        log.info('auth.resend_confirmation.accepted', { email: validated.email });
        return jsonResponse(200, { message_key: 'auth.confirmation_email_resent' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    requestPasswordReset: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(requestPasswordResetSchema, body);

        await requestPasswordReset(
          { email: validated.email, locale: validated.locale },
          {
            users: deps.users,
            passwordResets: deps.passwordResets,
            emailSender: deps.emailSender,
            tokenGenerator: deps.tokenGenerator,
            hashService: deps.hashService,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            config: deps.config
          }
        );

        log.info('auth.password_reset_request.accepted', { email: validated.email });
        return jsonResponse(200, { message_key: 'auth.password_reset_requested' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    resetPassword: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(resetPasswordSchema, body);

        await resetPassword(
          { token: validated.token, password: validated.password },
          {
            passwordResets: deps.passwordResets,
            users: deps.users,
            passwordHasher: deps.passwordHasher,
            hashService: deps.hashService,
            clock: deps.clock
          }
        );

        log.info('auth.password_reset.success');
        return jsonResponse(200, { message_key: 'auth.password_reset_success' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    changePassword: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        if (!ctx.auth?.userId) {
          return errorResponse(401, 'auth.unauthorized', undefined, logContext);
        }

        const validated = parseWithSchema(changePasswordSchema, body);

        await changePassword(
          {
            userId: ctx.auth.userId,
            oldPassword: validated.old_password,
            newPassword: validated.new_password,
          },
          {
            users: deps.users,
            passwordHasher: deps.passwordHasher,
          }
        );

        log.info('auth.password_changed');
        return jsonResponse(200, { message_key: 'auth.password_changed' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    refresh: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(refreshTokenSchema, body ?? {});
        const refreshToken =
          validated.refresh_token ?? getRefreshTokenFromCookie(ctx.request);

        if (!refreshToken) {
          return errorResponse(401, 'auth.invalid_token', undefined, logContext, clearRefreshCookieHeaders());
        }

        const fingerprint = ctx.request.headers.get('x-device-fingerprint') || undefined;
        const userAgent = ctx.request.headers.get('user-agent') || undefined;

        const result = await refreshAccessToken(
          { refreshToken, fingerprint, userAgent },
          {
            refreshTokens: deps.refreshTokens,
            users: deps.users,
            jwtService: deps.jwtService,
            hashService: deps.hashService,
            tokenGenerator: deps.tokenGenerator,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            config: deps.config,
            auditLog: deps.auditLog,
          }
        );

        log.info('auth.refresh.success');
        return jsonResponse(
          200,
          {
            data: {
              accessToken: result.accessToken,
              tokenType: result.tokenType,
              expiresIn: result.expiresIn,
              refreshExpiresIn: result.refreshExpiresIn,
            },
          },
          logContext,
          withRefreshCookie(result.refreshToken, result.refreshExpiresIn)
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    revoke: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(revokeTokenSchema, body ?? {});
        const refreshToken =
          validated.refresh_token ?? getRefreshTokenFromCookie(ctx.request);

        if (!refreshToken) {
          log.info('auth.revoke.success', { source: 'missing_token_cookie' });
          return jsonResponse(200, { message_key: 'auth.token_revoked' }, logContext, clearRefreshCookieHeaders());
        }

        await revokeRefreshToken(
          { refreshToken },
          {
            refreshTokens: deps.refreshTokens,
            hashService: deps.hashService,
            clock: deps.clock
          }
        );

        log.info('auth.revoke.success');
        return jsonResponse(200, { message_key: 'auth.token_revoked' }, logContext, clearRefreshCookieHeaders());
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    listSessions: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const userId = ctx.auth!.userId;
        const tokens = await deps.refreshTokens.findActiveByUserId(userId);
        const data = tokens.map((t) => ({
          id: t.id,
          createdAt: t.createdAt.toISOString(),
          expiresAt: t.expiresAt.toISOString(),
          userAgent: t.userAgent || null,
          hasFingerprint: !!t.fingerprintHash,
        }));
        return jsonResponse(200, { data }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    revokeSession: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const sessionId = ctx.params.id;
        const userId = ctx.auth!.userId;
        const tokens = await deps.refreshTokens.findActiveByUserId(userId);
        const token = tokens.find((t) => t.id === sessionId);
        if (!token) {
          return errorResponse(404, 'auth.session_not_found', undefined, logContext);
        }
        await deps.refreshTokens.revoke(sessionId, deps.clock.now());
        log.info('auth.session_revoked', { session_id: sessionId });
        return jsonResponse(200, { message_key: 'auth.session_revoked' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    revokeAllSessions: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const userId = ctx.auth!.userId;
        await deps.refreshTokens.revokeAllByUserId(userId, deps.clock.now());
        log.info('auth.all_sessions_revoked', { user_id: userId });
        return jsonResponse(200, { message_key: 'auth.all_sessions_revoked' }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },
  };
}
