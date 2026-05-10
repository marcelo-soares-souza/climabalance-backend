import type { UserRepository } from '../../domain/user/user-repository';
import type { ConsentRepository } from '../../domain/user/consent-repository';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { exportUserData } from '../../application/users/export-user-data';
import { getLogger } from '../../shared/utils/logger';
import { buildLogContext } from '../../shared/http/log-context';
import { withAuditLogContext } from '../../shared/http/audit-log-with-context';
import { parseWithSchema } from './schemas';
import { uuidv7 } from '../../shared/utils/id';
import { z } from 'zod';

export type PrivacyHandlersDeps = {
  users: UserRepository;
  consents: ConsentRepository;
  auditLog: Pick<AuditLogRepository, 'log'>;
  compensationHistoryRepository: {
    getPaidContributionSummaryBySupporter(userId: string): Promise<{
      estimatedOffsetTCO2e: number;
      totalTreesPurchased: number;
      totalContributionAmount: number;
    }>;
    listBySupporter(
      input: {
        supporterUserId: string;
        status?: string;
        limit: number;
        offset: number;
      },
      client?: any
    ): Promise<any[]>;
  };
  compensationCertificateRepository: {
    listBySupporterUserId(params: {
      supporterUserId: string;
      limit: number;
      offset: number;
    }): Promise<any[]>;
  };
  calculationRepository: {
    findByUserId(
      userId: string,
      filters?: { status?: string; profile_type?: string; limit?: number; offset?: number }
    ): Promise<any[]>;
    sumFinalizedTCO2eByUser(userId: string): Promise<number>;
  };
};

const subjectRequestSchema = z.object({
  request_type: z.enum([
    'access',
    'rectification',
    'erasure',
    'portability',
    'restrict',
    'object',
    'withdraw_consent',
  ]),
  details: z.string().max(2000).optional(),
});

const cookieConsentSchema = z.object({
  consent_type: z.enum(['analytics', 'functional', 'marketing']),
  consented: z.boolean(),
});

export function createPrivacyHandlers(deps: PrivacyHandlersDeps) {
  return {
    exportData: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId)) {
          const userBySlug = await deps.users.findBySlug(userId);
          if (userBySlug) {
            userId = userBySlug.id;
          } else {
            const userById = await deps.users.findById(userId);
            if (!userById) {
              return jsonResponse(404, { message_key: 'user.not_found' }, logContext);
            }
            userId = userById.id;
          }
        }

        const data = await exportUserData(userId, {
          users: deps.users,
          consents: deps.consents,
          compensationHistoryRepository: deps.compensationHistoryRepository,
          compensationCertificateRepository: deps.compensationCertificateRepository,
          calculationRepository: deps.calculationRepository,
        });
        log.info('privacy.data_export', { user_id: userId });
        await requestAuditLog.log({
          actorUserId: ctx.auth?.userId ?? userId,
          action: 'privacy.data_exported',
          entityType: 'user',
          entityId: userId,
          success: true,
          httpStatus: 200,
          severity: 'info',
          category: ['privacy', 'data_access'],
          isSensitive: true,
        });
        return jsonResponse(200, { data }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    createSubjectRequest: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const userId = ctx.auth!.userId;
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(subjectRequestSchema, body);

        const request = await deps.consents.createSubjectRequest({
          id: uuidv7(),
          userId,
          requestType: validated.request_type,
          details: validated.details,
        });

        log.info('privacy.subject_request.created', {
          user_id: userId,
          request_type: validated.request_type,
        });
        await requestAuditLog.log({
          actorUserId: userId,
          action: 'privacy.subject_request.created',
          entityType: 'privacy_subject_request',
          entityId: request.id,
          success: true,
          httpStatus: 201,
          severity: 'info',
          category: ['privacy', 'data_modification'],
          isSensitive: true,
          newState: {
            requestType: request.requestType,
            status: request.status,
            hasDetails: Boolean(request.details),
          },
          changedFields: ['requestType', 'status', 'details'],
        });

        return jsonResponse(201, {
          data: {
            id: request.id,
            request_type: request.requestType,
            status: request.status,
            created_at: request.createdAt.toISOString(),
          },
        }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    listSubjectRequests: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      try {
        const userId = ctx.auth!.userId;
        const requests = await deps.consents.getSubjectRequestsByUser(userId);
        log.info('privacy.subject_requests.list', { user_id: userId, count: requests.length });
        return jsonResponse(200, {
          data: requests.map((r) => ({
            id: r.id,
            request_type: r.requestType,
            status: r.status,
            details: r.details ?? null,
            resolution_notes: r.resolutionNotes ?? null,
            resolved_at: r.resolvedAt?.toISOString() ?? null,
            created_at: r.createdAt.toISOString(),
          })),
        }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    recordCookieConsent: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const userId = ctx.auth!.userId;
        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== 'object' || body === null) {
          return errorResponse(400, 'request.invalid_body', undefined, logContext);
        }

        const validated = parseWithSchema(cookieConsentSchema, body);

        const consent = await deps.consents.recordConsent({
          id: uuidv7(),
          userId,
          consentType: `cookie_${validated.consent_type}`,
          consented: validated.consented,
          ipAddress: ctx.clientIp,
        });

        log.info('privacy.cookie_consent.recorded', {
          user_id: userId,
          consent_type: validated.consent_type,
          consented: validated.consented,
        });
        await requestAuditLog.log({
          actorUserId: userId,
          action: 'privacy.cookie_consent.recorded',
          entityType: 'user_consent',
          entityId: consent.id,
          success: true,
          httpStatus: 201,
          severity: 'info',
          category: ['privacy', 'data_modification'],
          isSensitive: true,
          newState: {
            consentType: consent.consentType,
            consented: consent.consented,
          },
          changedFields: ['consentType', 'consented'],
        });

        return jsonResponse(201, {
          data: {
            id: consent.id,
            consent_type: consent.consentType,
            consented: consent.consented,
            created_at: consent.createdAt.toISOString(),
          },
        }, logContext);
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },
  };
}
