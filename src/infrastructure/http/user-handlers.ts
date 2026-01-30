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

    getProfile: async (ctx: HttpContext, userId: string) => {
      const log = getLogger({ requestId: ctx.requestId, userId: ctx.auth?.userId, clientIp: ctx.clientIp });
      try {
        const profile = await deps.users.getProfile(userId);
        log.info('user.profile.get', { user_id: userId, found: Boolean(profile) });
        if (!profile) {
          return jsonResponse(200, { data: null });
        }
        return jsonResponse(200, {
          data: {
            id: profile.id,
            user_id: profile.userId,
            display_name: profile.displayName,
            document_type: profile.documentType,
            document_number: profile.documentNumber,
            birth_date: profile.birthDate,
            phone: profile.phone,
            country_code: profile.countryCode,
            address_line1: profile.addressLine1,
            address_line2: profile.addressLine2,
            address_city: profile.addressCity,
            address_state: profile.addressState,
            address_postal_code: profile.addressPostalCode,
            address_country: profile.addressCountry
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

        const displayName = optionalString((body as Record<string, unknown>).display_name, 'display_name', 200);
        const documentType = optionalString((body as Record<string, unknown>).document_type, 'document_type', 30);
        const documentNumber = optionalString((body as Record<string, unknown>).document_number, 'document_number', 50);
        const birthDate = optionalString((body as Record<string, unknown>).birth_date, 'birth_date', 20);
        const phone = optionalString((body as Record<string, unknown>).phone, 'phone', 50);
        const countryCode = optionalString((body as Record<string, unknown>).country_code, 'country_code', 2);
        const addressLine1 = optionalString((body as Record<string, unknown>).address_line1, 'address_line1', 200);
        const addressLine2 = optionalString((body as Record<string, unknown>).address_line2, 'address_line2', 200);
        const addressCity = optionalString((body as Record<string, unknown>).address_city, 'address_city', 120);
        const addressState = optionalString((body as Record<string, unknown>).address_state, 'address_state', 120);
        const addressPostalCode = optionalString((body as Record<string, unknown>).address_postal_code, 'address_postal_code', 30);
        const addressCountry = optionalString((body as Record<string, unknown>).address_country, 'address_country', 2);

        const errors = [
          displayName,
          documentType,
          documentNumber,
          birthDate,
          phone,
          countryCode,
          addressLine1,
          addressLine2,
          addressCity,
          addressState,
          addressPostalCode,
          addressCountry
        ].filter((value) => value !== undefined && typeof value !== 'string');

        if (errors.length > 0) {
          log.warn('user.profile.validation_failed', { errors });
          return errorResponse(400, 'request.validation_failed', errors);
        }

        const profile = {
          id: uuidv7(),
          displayName: typeof displayName === 'string' ? displayName : undefined,
          documentType: typeof documentType === 'string' ? documentType : undefined,
          documentNumber: typeof documentNumber === 'string' ? documentNumber : undefined,
          birthDate: typeof birthDate === 'string' ? birthDate : undefined,
          phone: typeof phone === 'string' ? phone : undefined,
          countryCode: typeof countryCode === 'string' ? countryCode : undefined,
          addressLine1: typeof addressLine1 === 'string' ? addressLine1 : undefined,
          addressLine2: typeof addressLine2 === 'string' ? addressLine2 : undefined,
          addressCity: typeof addressCity === 'string' ? addressCity : undefined,
          addressState: typeof addressState === 'string' ? addressState : undefined,
          addressPostalCode: typeof addressPostalCode === 'string' ? addressPostalCode : undefined,
          addressCountry: typeof addressCountry === 'string' ? addressCountry : undefined
        };

        const profileResult = await deps.users.upsertProfile(userId, profile);

        log.info('user.profile.upsert', { user_id: userId });
        return jsonResponse(200, {
          data: {
            id: profileResult.id,
            user_id: profileResult.userId,
            display_name: profileResult.displayName,
            document_type: profileResult.documentType,
            document_number: profileResult.documentNumber,
            birth_date: profileResult.birthDate,
            phone: profileResult.phone,
            country_code: profileResult.countryCode,
            address_line1: profileResult.addressLine1,
            address_line2: profileResult.addressLine2,
            address_city: profileResult.addressCity,
            address_state: profileResult.addressState,
            address_postal_code: profileResult.addressPostalCode,
            address_country: profileResult.addressCountry
          }
        });
      } catch (error) {
        return handleError(error);
      }
    }
  };
}
