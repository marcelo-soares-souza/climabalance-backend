import type { UserRepository } from '../../domain/user/user-repository';
import type { PasswordHasher } from '../crypto/password';
import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { deleteUser } from '../../application/users/delete-user';
import { getUser } from '../../application/users/get-user';
import { listUsers } from '../../application/users/list-users';
import { updateUser } from '../../application/users/update-user';
import { getClimateBalance } from '../../application/users/get-climate-balance';
import { uuidv7 } from '../../shared/utils/id';
import { getLogger } from '../../shared/utils/logger';
import { listUsersQuerySchema, updateUserSchema, upsertProfileSchema, parseWithSchema } from './schemas';
import { buildLogContext } from '../../shared/http/log-context';
import { parseQueryWithSchema } from './schemas/validation-helper';

export type UserHandlersDeps = {
  users: UserRepository;
  passwordHasher: PasswordHasher;
  calculationRepository: {
    sumFinalizedTCO2eByUser(userId: string): Promise<number>;
  };
  compensationHistoryRepository: {
    getPaidContributionSummaryBySupporter(userId: string): Promise<{
      estimatedOffsetTCO2e: number;
      totalTreesPurchased: number;
      totalContributionAmount: number;
    }>;
  };
};

export function createUserHandlers(deps: UserHandlersDeps) {
  const mapUserSummary = async (
    user: Awaited<ReturnType<typeof getUser>>,
    roleMap?: Record<string, string[]>,
  ) => ({
    id: user.id,
    email: user.email,
    status: user.status,
    locale: user.locale,
    email_confirmed_at: user.emailConfirmedAt,
    last_login_at: user.lastLoginAt,
    created_at: user.createdAt,
    roles: roleMap?.[user.id] ?? await deps.users.getRoles(user.id),
  });

  return {
    list: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const query = parseQueryWithSchema(listUsersQuerySchema, ctx.query);
        const users = await listUsers(
          {
            status: query.status,
            search: query.search,
            sortBy: query.sort_by,
            sortOrder: query.sort_order,
            limit: query.limit,
            offset: query.offset
          },
          { users: deps.users }
        );
        const roleMap = deps.users.getRolesByUserIds
          ? await deps.users.getRolesByUserIds(users.map((user) => user.id))
          : undefined;
        log.info('user.list', { count: users.length });
        return jsonResponse(
          200,
          {
            data: await Promise.all(users.map((user) => mapUserSummary(user, roleMap)))
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    get: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const user = await getUser(userId, { users: deps.users });
        log.info('user.get', { user_id: userId });
        return jsonResponse(
          200,
          {
            data: await mapUserSummary(user)
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    getProfile: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const profile = await deps.users.getProfile(userId);
        log.info('user.profile.get', { user_id: userId, found: Boolean(profile) });
        if (!profile) {
          return jsonResponse(200, { data: null }, logContext);
        }
        return jsonResponse(
          200,
          {
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
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    getClimateBalance: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const balance = await getClimateBalance(userId, {
          calculationRepository: deps.calculationRepository,
          compensationHistoryRepository: deps.compensationHistoryRepository,
        });
        log.info('user.climate_balance.get', { user_id: userId });
        return jsonResponse(
          200,
          {
            data: {
              gross_emissions_t_co2e: balance.grossEmissionsTCO2e,
              estimated_offset_t_co2e: balance.estimatedOffsetTCO2e,
              net_balance_t_co2e: balance.netBalanceTCO2e,
              total_trees_purchased: balance.totalTreesPurchased,
              total_contribution_amount: balance.totalContributionAmount,
            },
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    update: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(updateUserSchema, body);

        const user = await updateUser(
          {
            id: userId,
            email: validated.email,
            password: validated.password,
            locale: validated.locale,
            status: validated.status
          },
          { users: deps.users, passwordHasher: deps.passwordHasher }
        );

        log.info('user.update', { user_id: userId });
        return jsonResponse(
          200,
          {
            data: await mapUserSummary(user)
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    remove: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        await deleteUser(userId, { users: deps.users });
        log.warn('user.deleted', { user_id: userId });
        return jsonResponse(200, { data: { id: userId } }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    createProfile: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(upsertProfileSchema, body);

        const profile = {
          id: uuidv7(),
          displayName: validated.display_name,
          documentType: validated.document_type,
          documentNumber: validated.document_number,
          birthDate: validated.birth_date,
          phone: validated.phone,
          countryCode: validated.country_code,
          addressLine1: validated.address_line1,
          addressLine2: validated.address_line2,
          addressCity: validated.address_city,
          addressState: validated.address_state,
          addressPostalCode: validated.address_postal_code,
          addressCountry: validated.address_country
        };

        const profileResult = await deps.users.upsertProfile(userId, profile);

        log.info('user.profile.upsert', { user_id: userId });
        return jsonResponse(
          200,
          {
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
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    }
  };
}
