import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordHasher } from '../crypto/password';
import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { optionalString, requireEmail } from '../../shared/validation/validators';
import { deleteUser } from '../../application/users/delete-user';
import { getUser } from '../../application/users/get-user';
import { listUsers } from '../../application/users/list-users';
import { updateUser } from '../../application/users/update-user';
import { uuidv7 } from '../../shared/utils/id';
import { getLogger } from '../../shared/utils/logger';

export type UserHandlersDeps = {
  users: UserRepository;
  passwordHasher: PasswordHasher;
};

export function createUserHandlers(deps: UserHandlersDeps) {
  return {
    list: async (ctx: HttpContext) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const url = new URL(ctx.request.url);
        const status = url.searchParams.get('status') ?? undefined;
        const search = url.searchParams.get('search') ?? undefined;
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');
        const users = await listUsers(
          {
            status,
            search,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined
          },
          { users: deps.users }
        );
        log.info('user.list', { count: users.length });
        return jsonResponse(200, {
          data: users.map((user) => ({
            id: user.id,
            email: user.email,
            status: user.status,
            locale: user.locale,
            email_confirmed_at: user.emailConfirmedAt
          }))
        });
      } catch (error) {
        return handleError(error, log);
      }
    },

    get: async (ctx: HttpContext, userId: string) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const user = await getUser(userId, { users: deps.users });
        log.info('user.get', { user_id: userId });
        return jsonResponse(200, {
          data: {
            id: user.id,
            email: user.email,
            status: user.status,
            locale: user.locale,
            email_confirmed_at: user.emailConfirmedAt
          }
        });
      } catch (error) {
        return handleError(error, log);
      }
    },

    update: async (ctx: HttpContext, userId: string) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const body = await parseJson(ctx.request);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body');
        }

        const emailRaw = (body as Record<string, unknown>).email;
        const email = emailRaw !== undefined ? requireEmail(emailRaw, 'email') : undefined;
        const password = (body as Record<string, unknown>).password;
        const locale = (body as Record<string, unknown>).locale;
        const status = (body as Record<string, unknown>).status;

        const errors = [email].filter((value) => value !== undefined && typeof value !== 'string');
        if (errors.length > 0) {
          log.warn('user.update.validation_failed', { errors });
          return errorResponse(400, 'request.validation_failed', errors);
        }

        if (typeof status === 'string' && !['active', 'pending', 'suspended'].includes(status)) {
          log.warn('user.update.validation_failed', { field: 'status', reason: 'invalid' });
          return errorResponse(400, 'request.validation_failed', [{ field: 'status', message: 'invalid' }]);
        }

        const user = await updateUser(
          {
            id: userId,
            email: typeof email === 'string' ? email : undefined,
            password: typeof password === 'string' ? password : undefined,
            locale: typeof locale === 'string' ? locale : undefined,
            status: typeof status === 'string' ? (status as 'active' | 'pending' | 'suspended') : undefined
          },
          { users: deps.users, passwordHasher: deps.passwordHasher }
        );

        log.info('user.update', { user_id: userId });
        return jsonResponse(200, {
          data: {
            id: user.id,
            email: user.email,
            status: user.status,
            locale: user.locale,
            email_confirmed_at: user.emailConfirmedAt
          }
        });
      } catch (error) {
        return handleError(error, log);
      }
    },

    remove: async (ctx: HttpContext, userId: string) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const user = await deleteUser(userId, { users: deps.users });
        log.warn('user.deleted', { user_id: userId });
        return jsonResponse(200, {
          data: { id: user.id, deleted_at: user.deletedAt }
        });
      } catch (error) {
        return handleError(error, log);
      }
    },

    createProfile: async (ctx: HttpContext, userId: string) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const body = await parseJson(ctx.request);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body');
        }

        const displayName = optionalString((body as Record<string, unknown>).display_name, 'display_name');
        if (displayName && typeof displayName !== 'string') {
          log.warn('user.profile.validation_failed', { errors: [displayName] });
          return errorResponse(400, 'request.validation_failed', [displayName]);
        }

        const profile = {
          id: uuidv7(),
          displayName: typeof displayName === 'string' ? displayName : undefined,
          documentType: (body as Record<string, unknown>).document_type as string | undefined,
          documentNumber: (body as Record<string, unknown>).document_number as string | undefined,
          birthDate: (body as Record<string, unknown>).birth_date as string | undefined,
          phone: (body as Record<string, unknown>).phone as string | undefined,
          countryCode: (body as Record<string, unknown>).country_code as string | undefined,
          addressLine1: (body as Record<string, unknown>).address_line1 as string | undefined,
          addressLine2: (body as Record<string, unknown>).address_line2 as string | undefined,
          addressCity: (body as Record<string, unknown>).address_city as string | undefined,
          addressState: (body as Record<string, unknown>).address_state as string | undefined,
          addressPostalCode: (body as Record<string, unknown>).address_postal_code as string | undefined,
          addressCountry: (body as Record<string, unknown>).address_country as string | undefined
        };

        const profileResult = await deps.users.upsertProfile(userId, profile);

        log.info('user.profile.upsert', { user_id: userId });
        return jsonResponse(200, {
          data: {
            id: profileResult.id,
            user_id: profileResult.userId,
            display_name: profileResult.displayName
          }
        });
      } catch (error) {
        return handleError(error);
      }
    }
  };
}
