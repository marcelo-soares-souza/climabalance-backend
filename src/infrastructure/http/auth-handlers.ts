import type { EmailConfirmationRepository } from '../../domain/user/email-confirmation-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordHasher } from '../crypto/password';
import type { EmailSender } from '../email/email-sender';
import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { requireEmail, requireString } from '../../shared/validation/validators';
import { authenticateUser } from '../../application/auth/authenticate-user';
import { confirmEmail } from '../../application/auth/confirm-email';
import { registerUser } from '../../application/auth/register-user';
import { getLogger } from '../../shared/utils/logger';

export type AuthHandlersDeps = {
  users: UserRepository;
  confirmations: EmailConfirmationRepository;
  passwordHasher: PasswordHasher;
  emailSender: EmailSender;
};

export function createAuthHandlers(deps: AuthHandlersDeps) {
  return {
    register: async (ctx: HttpContext) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const body = await parseJson(ctx.request);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body');
        }

        const email = requireEmail((body as Record<string, unknown>).email, 'email');
        const password = requireString((body as Record<string, unknown>).password, 'password', 200);
        const passwordConfirm = requireString((body as Record<string, unknown>).password_confirm, 'password_confirm', 200);
        const locale = (body as Record<string, unknown>).locale;
        const roleKey = (body as Record<string, unknown>).role_key;

        const errors = [email, password, passwordConfirm].filter((value) => typeof value !== 'string');
        if (errors.length > 0) {
          log.warn('auth.register.validation_failed', { errors });
          return errorResponse(400, 'request.validation_failed', errors);
        }

        if (typeof password === 'string' && password.length < 8) {
          log.warn('auth.register.validation_failed', { field: 'password', reason: 'too_short' });
          return errorResponse(400, 'request.validation_failed', [{ field: 'password', message: 'too_short' }]);
        }
        if (password !== passwordConfirm) {
          log.warn('auth.register.validation_failed', { field: 'password_confirm', reason: 'mismatch' });
          return errorResponse(400, 'request.validation_failed', [{ field: 'password_confirm', message: 'mismatch' }]);
        }

        const allowedRoles = ['individual', 'producer', 'legal_entity'];
        if (typeof roleKey === 'string' && !allowedRoles.includes(roleKey)) {
          log.warn('auth.register.validation_failed', { field: 'role_key', reason: 'invalid' });
          return errorResponse(400, 'request.validation_failed', [{ field: 'role_key', message: 'invalid' }]);
        }

        const result = await registerUser(
          {
            email: email as string,
            password: password as string,
            locale: typeof locale === 'string' ? locale : undefined,
            roleKey: typeof roleKey === 'string' ? roleKey : undefined
          },
          {
            users: deps.users,
            confirmations: deps.confirmations,
            passwordHasher: deps.passwordHasher,
            emailSender: deps.emailSender
          }
        );

        log.info('auth.register.created', { user_id: result.id, email: result.email });
        return jsonResponse(201, {
          data: result,
          message_key: 'auth.registration_pending_confirmation'
        });
      } catch (error) {
        return handleError(error, log);
      }
    },

    login: async (ctx: HttpContext) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const body = await parseJson(ctx.request);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body');
        }

        const email = requireEmail((body as Record<string, unknown>).email, 'email');
        const password = requireString((body as Record<string, unknown>).password, 'password', 200);
        const errors = [email, password].filter((value) => typeof value !== 'string');
        if (errors.length > 0) {
          log.warn('auth.login.validation_failed', { errors });
          return errorResponse(400, 'request.validation_failed', errors);
        }

        log.debug('auth.login.attempt', { email });
        const token = await authenticateUser(
          { email: email as string, password: password as string },
          { users: deps.users, passwordHasher: deps.passwordHasher }
        );

        log.info('auth.login.success', { email });
        return jsonResponse(200, { data: token });
      } catch (error) {
        return handleError(error, log);
      }
    },

    confirmEmail: async (ctx: HttpContext) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const body = await parseJson(ctx.request);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body');
        }

        const token = requireString((body as Record<string, unknown>).token, 'token', 500);
        if (typeof token !== 'string') {
          log.warn('auth.confirm.validation_failed', { errors: [token] });
          return errorResponse(400, 'request.validation_failed', [token]);
        }

        const result = await confirmEmail(token, { confirmations: deps.confirmations, users: deps.users });
        log.info('auth.confirm.success', { user_id: result.userId });
        return jsonResponse(200, { message_key: 'auth.email_confirmed' });
      } catch (error) {
        return handleError(error, log);
      }
    }
  };
}
