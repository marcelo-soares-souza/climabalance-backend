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
import { listUsersQuerySchema, updateUserSchema, upsertProfileSchema, uploadProfileAvatarSchema, parseWithSchema } from './schemas';
import { buildLogContext } from '../../shared/http/log-context';
import { parseQueryWithSchema } from './schemas/validation-helper';
import type { LocalProfileAvatarStorage } from '../storage/local-profile-avatar-storage';

export type UserHandlersDeps = {
  users: UserRepository;
  passwordHasher: PasswordHasher;
  profileAvatarStorage: LocalProfileAvatarStorage;
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveUserId(idOrSlug: string, users: UserRepository): Promise<string | null> {
  if (UUID_REGEX.test(idOrSlug)) return idOrSlug;
  const user = await users.findBySlug(idOrSlug);
  return user?.id ?? null;
}

export function createUserHandlers(deps: UserHandlersDeps) {
  const mapUserSummary = async (
    user: Awaited<ReturnType<typeof getUser>>,
    roleMap?: Record<string, string[]>,
  ) => ({
    id: user.id,
    email: user.email,
    slug: user.slug,
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

    get: async (ctx: HttpContext, userIdOrSlug: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let resolvedId = userIdOrSlug;

        if (!uuidRegex.test(userIdOrSlug)) {
          const user = await deps.users.findBySlug(userIdOrSlug);
          if (!user) {
            return jsonResponse(404, { message_key: 'user.not_found' }, logContext);
          }
          resolvedId = user.id;
        }

        const user = await getUser(resolvedId, { users: deps.users });
        log.info('user.get', { user_id: resolvedId });
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

    getProfile: async (ctx: HttpContext, userIdOrSlug: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const userId = await resolveUserId(userIdOrSlug, deps.users);
        if (!userId) {
          return jsonResponse(404, { message_key: 'user.not_found' }, logContext);
        }
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
              address_country: profile.addressCountry,
              about: profile.about,
              website_url: profile.websiteUrl,
              instagram_url: profile.instagramUrl,
              facebook_url: profile.facebookUrl,
              x_url: profile.xUrl,
              bluesky_url: profile.blueskyUrl,
              mastodon_url: profile.mastodonUrl,
              youtube_url: profile.youtubeUrl,
              linkedin_url: profile.linkedinUrl,
              avatar_path: profile.avatarPath
            }
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    getClimateBalance: async (ctx: HttpContext, userIdOrSlug: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const userId = await resolveUserId(userIdOrSlug, deps.users);
        if (!userId) {
          return jsonResponse(404, { message_key: 'user.not_found' }, logContext);
        }
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
          addressCountry: validated.address_country,
          about: validated.about,
          websiteUrl: validated.website_url,
          instagramUrl: validated.instagram_url,
          facebookUrl: validated.facebook_url,
          xUrl: validated.x_url,
          blueskyUrl: validated.bluesky_url,
          mastodonUrl: validated.mastodon_url,
          youtubeUrl: validated.youtube_url,
          linkedinUrl: validated.linkedin_url
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
              address_country: profileResult.addressCountry,
              about: profileResult.about,
              website_url: profileResult.websiteUrl,
              instagram_url: profileResult.instagramUrl,
              facebook_url: profileResult.facebookUrl,
              x_url: profileResult.xUrl,
              bluesky_url: profileResult.blueskyUrl,
              mastodon_url: profileResult.mastodonUrl,
              youtube_url: profileResult.youtubeUrl,
              linkedin_url: profileResult.linkedinUrl,
              avatar_path: profileResult.avatarPath
            }
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    uploadAvatar: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const body = await parseJson(ctx.request, ctx, 12 * 1024 * 1024);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(uploadProfileAvatarSchema, body);

        let bytes: Uint8Array;
        try {
          const decoded = Buffer.from(validated.file_base64, 'base64');
          bytes = new Uint8Array(decoded);
        } catch {
          return errorResponse(400, 'profile.avatar.invalid_base64', undefined, logContext);
        }

        if (bytes.length === 0) {
          return errorResponse(400, 'profile.avatar.empty_file', undefined, logContext);
        }

        const existingProfile = await deps.users.getProfile(userId);

        if (existingProfile?.avatarPath) {
          await deps.profileAvatarStorage.delete(existingProfile.avatarPath);
        }

        const { storagePath } = await deps.profileAvatarStorage.save({
          userId,
          bytes,
        });

        await deps.users.upsertProfile(userId, {
          id: existingProfile?.id ?? uuidv7(),
          avatarPath: storagePath,
        });

        log.info('user.profile.avatar.uploaded', { user_id: userId });
        return jsonResponse(
          200,
          {
            data: {
              avatar_path: storagePath,
              avatar_url: `/api/v1/users/${userId}/profile/avatar/file`,
            },
          },
          logContext
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    getAvatarFile: async (ctx: HttpContext, userIdOrSlug: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const userId = await resolveUserId(userIdOrSlug, deps.users);
        if (!userId) {
          return jsonResponse(404, { message_key: 'user.not_found' }, logContext);
        }
        const profile = await deps.users.getProfile(userId);
        if (!profile?.avatarPath) {
          return errorResponse(404, 'profile.avatar.not_found', undefined, logContext);
        }

        const bytes = await deps.profileAvatarStorage.read(profile.avatarPath);
        log.info('user.profile.avatar.served', { user_id: userId });

        return new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },
  };
}
