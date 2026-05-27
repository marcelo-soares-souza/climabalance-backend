import type { UserRepository } from "../../domain/user/user-repository";
import type { ConsentRepository } from "../../domain/user/consent-repository";
import type { AuditLogRepository } from "../../domain/audit/audit-log-repository";
import type { EmailSender } from "../email/email-sender";
import type { HttpContext } from "../../shared/http/router";
import { parseJson } from "../../shared/http/request";
import { errorResponse, jsonResponse } from "../../shared/http/response";
import { handleError } from "./error-mapper";
import { exportUserData } from "../../application/users/export-user-data";
import { getLogger } from "../../shared/utils/logger";
import { buildLogContext } from "../../shared/http/log-context";
import { withAuditLogContext } from "../../shared/http/audit-log-with-context";
import { parseWithSchema } from "./schemas";
import { uuidv7 } from "../../shared/utils/id";
import { buildPrivacySubjectRequestNotification } from "../email/templates";
import { z } from "zod";

export type PrivacyHandlersDeps = {
  users: UserRepository;
  consents: ConsentRepository;
  emailSender: EmailSender;
  auditLog: Pick<AuditLogRepository, "log">;
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
      client?: any,
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
      filters?: {
        status?: string;
        profile_type?: string;
        limit?: number;
        offset?: number;
      },
    ): Promise<any[]>;
    sumFinalizedTCO2eByUser(userId: string): Promise<number>;
  };
};

const subjectRequestSchema = z.object({
  request_type: z.enum([
    "access",
    "rectification",
    "erasure",
    "portability",
    "restrict",
    "object",
    "withdraw_consent",
  ]),
  details: z.string().max(2000).optional(),
});

const cookieConsentSchema = z.object({
  consent_type: z.enum(["analytics", "functional", "marketing"]),
  consented: z.boolean(),
});

export function createPrivacyHandlers(deps: PrivacyHandlersDeps) {
  return {
    exportData: async (ctx: HttpContext, userId: string) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId)) {
          const userBySlug = await deps.users.findBySlug(userId);
          if (userBySlug) {
            userId = userBySlug.id;
          } else {
            const userById = await deps.users.findById(userId);
            if (!userById) {
              return jsonResponse(
                404,
                { message_key: "user.not_found" },
                logContext,
              );
            }
            userId = userById.id;
          }
        }

        const data = await exportUserData(userId, {
          users: deps.users,
          consents: deps.consents,
          compensationHistoryRepository: deps.compensationHistoryRepository,
          compensationCertificateRepository:
            deps.compensationCertificateRepository,
          calculationRepository: deps.calculationRepository,
        });
        log.info("privacy.data_export", { user_id: userId });
        await requestAuditLog.log({
          actorUserId: ctx.auth?.userId ?? userId,
          action: "privacy.data_exported",
          entityType: "user",
          entityId: userId,
          success: true,
          httpStatus: 200,
          severity: "info",
          category: ["privacy", "data_access"],
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
        if (typeof body !== "object" || body === null) {
          return errorResponse(
            400,
            "request.invalid_body",
            undefined,
            logContext,
          );
        }

        const validated = parseWithSchema(subjectRequestSchema, body);

        const request = await deps.consents.createSubjectRequest({
          id: uuidv7(),
          userId,
          requestType: validated.request_type,
          details: validated.details,
        });

        log.info("privacy.subject_request.created", {
          user_id: userId,
          request_type: validated.request_type,
        });
        await requestAuditLog.log({
          actorUserId: userId,
          action: "privacy.subject_request.created",
          entityType: "privacy_subject_request",
          entityId: request.id,
          success: true,
          httpStatus: 201,
          severity: "info",
          category: ["privacy", "data_modification"],
          isSensitive: true,
          newState: {
            requestType: request.requestType,
            status: request.status,
            hasDetails: Boolean(request.details),
          },
          changedFields: ["requestType", "status", "details"],
        });

        const requestingUser = await deps.users.findById(userId);
        if (requestingUser) {
          const profile = await deps.users.getProfile(userId);
          const displayName = profile?.displayName || requestingUser.email;
          const adminUserIds =
            await deps.users.findUserIdsByRole("administrator");

          for (const adminId of adminUserIds) {
            const admin = await deps.users.findById(adminId);
            if (admin && admin.status === "active") {
              const emailMessage = buildPrivacySubjectRequestNotification(
                admin.locale,
                admin.email,
                displayName,
                requestingUser.email,
                validated.request_type,
                validated.details ?? "",
              );
              await deps.emailSender.send(emailMessage);
            }
          }
        }

        return jsonResponse(
          201,
          {
            data: {
              id: request.id,
              request_type: request.requestType,
              status: request.status,
              created_at: request.createdAt.toISOString(),
            },
          },
          logContext,
        );
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
        log.info("privacy.subject_requests.list", {
          user_id: userId,
          count: requests.length,
        });
        return jsonResponse(
          200,
          {
            data: requests.map((r) => ({
              id: r.id,
              request_type: r.requestType,
              status: r.status,
              details: r.details ?? null,
              resolution_notes: r.resolutionNotes ?? null,
              resolved_at: r.resolvedAt?.toISOString() ?? null,
              created_at: r.createdAt.toISOString(),
            })),
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    listAllSubjectRequests: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const url = new URL(ctx.request.url);
        const status = url.searchParams.get("status") || undefined;
        const requestType = url.searchParams.get("request_type") || undefined;
        const assignedTo = url.searchParams.get("assigned_to") || undefined;
        const limit = Math.min(
          Number(url.searchParams.get("limit")) || 50,
          200,
        );
        const offset = Number(url.searchParams.get("offset")) || 0;

        const { requests, total } = await deps.consents.listAllSubjectRequests({
          status,
          requestType,
          assignedToUserId: assignedTo,
          limit,
          offset,
        });

        log.info("privacy.admin.subject_requests.list", {
          count: requests.length,
          total,
          actor_user_id: ctx.auth?.userId,
        });
        await requestAuditLog.log({
          actorUserId: ctx.auth!.userId,
          action: "privacy.admin.subject_requests_listed",
          entityType: "privacy_subject_request",
          entityId: "admin",
          success: true,
          httpStatus: 200,
          severity: "info",
          category: ["privacy", "admin"],
          isSensitive: true,
        });

        return jsonResponse(
          200,
          {
            data: requests.map((r) => ({
              id: r.id,
              user_id: r.userId,
              request_type: r.requestType,
              status: r.status,
              details: r.details ?? null,
              resolution_notes: r.resolutionNotes ?? null,
              resolved_by_user_id: r.resolvedByUserId ?? null,
              resolved_at: r.resolvedAt?.toISOString() ?? null,
              assignee_user_id: r.assigneeUserId ?? null,
              due_at: r.dueAt?.toISOString() ?? null,
              legal_basis: r.legalBasis ?? null,
              identity_verified: r.identityVerified,
              data_categories_affected: r.dataCategoriesAffected ?? null,
              created_at: r.createdAt.toISOString(),
              updated_at: r.updatedAt.toISOString(),
            })),
            total,
            limit,
            offset,
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },

    updateSubjectRequest: async (ctx: HttpContext) => {
      const logContext = buildLogContext(ctx);
      const log = getLogger(logContext);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const id = (ctx.params as Record<string, string>)?.id;
        if (!id) {
          return errorResponse(
            400,
            "request.invalid_params",
            undefined,
            logContext,
          );
        }

        const body = await parseJson(ctx.request, ctx);
        if (typeof body !== "object" || body === null) {
          return errorResponse(
            400,
            "request.invalid_body",
            undefined,
            logContext,
          );
        }

        const updateSchema = z.object({
          status: z
            .enum(["pending", "in_progress", "completed", "rejected"])
            .optional(),
          assignee_user_id: z.string().nullable().optional(),
          resolution_notes: z.string().max(2000).optional(),
          due_at: z.string().datetime().optional(),
          legal_basis: z.string().max(100).optional(),
          identity_verified: z.boolean().optional(),
          data_categories_affected: z.array(z.string()).optional(),
        });

        const validated = parseWithSchema(updateSchema, body);

        const existing = await deps.consents.getSubjectRequestById(id);
        if (!existing) {
          return errorResponse(
            404,
            "privacy.subject_request.not_found",
            undefined,
            logContext,
          );
        }

        const updated = await deps.consents.updateSubjectRequest(id, {
          status: validated.status,
          assigneeUserId: validated.assignee_user_id,
          resolvedByUserId:
            validated.status === "completed" || validated.status === "rejected"
              ? ctx.auth!.userId
              : undefined,
          resolutionNotes: validated.resolution_notes,
          dueAt: validated.due_at ? new Date(validated.due_at) : undefined,
          legalBasis: validated.legal_basis,
          identityVerified: validated.identity_verified,
          dataCategoriesAffected: validated.data_categories_affected,
        });

        log.info("privacy.admin.subject_request.updated", {
          subject_request_id: id,
          actor_user_id: ctx.auth?.userId,
          changes: Object.keys(validated),
        });
        await requestAuditLog.log({
          actorUserId: ctx.auth!.userId,
          action: "privacy.admin.subject_request_updated",
          entityType: "privacy_subject_request",
          entityId: id,
          success: true,
          httpStatus: 200,
          severity: "info",
          category: ["privacy", "admin", "data_modification"],
          isSensitive: true,
          previousState: {
            status: existing.status,
            assigneeUserId: existing.assigneeUserId,
            resolvedByUserId: existing.resolvedByUserId,
          },
          newState: {
            status: updated?.status,
            assigneeUserId: updated?.assigneeUserId,
            resolvedByUserId: updated?.resolvedByUserId,
          },
          changedFields: Object.keys(validated),
        });

        return jsonResponse(
          200,
          {
            data: {
              id: updated?.id,
              request_type: updated?.requestType,
              status: updated?.status,
              resolution_notes: updated?.resolutionNotes ?? null,
              resolved_at: updated?.resolvedAt?.toISOString() ?? null,
              assignee_user_id: updated?.assigneeUserId ?? null,
              due_at: updated?.dueAt?.toISOString() ?? null,
              legal_basis: updated?.legalBasis ?? null,
              identity_verified: updated?.identityVerified,
              data_categories_affected: updated?.dataCategoriesAffected ?? null,
              created_at: updated?.createdAt.toISOString(),
              updated_at: updated?.updatedAt.toISOString(),
            },
          },
          logContext,
        );
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
        if (typeof body !== "object" || body === null) {
          return errorResponse(
            400,
            "request.invalid_body",
            undefined,
            logContext,
          );
        }

        const validated = parseWithSchema(cookieConsentSchema, body);

        const consent = await deps.consents.recordConsent({
          id: uuidv7(),
          userId,
          consentType: `cookie_${validated.consent_type}`,
          consented: validated.consented,
          ipAddress: ctx.clientIp,
        });

        log.info("privacy.cookie_consent.recorded", {
          user_id: userId,
          consent_type: validated.consent_type,
          consented: validated.consented,
        });
        await requestAuditLog.log({
          actorUserId: userId,
          action: "privacy.cookie_consent.recorded",
          entityType: "user_consent",
          entityId: consent.id,
          success: true,
          httpStatus: 201,
          severity: "info",
          category: ["privacy", "data_modification"],
          isSensitive: true,
          newState: {
            consentType: consent.consentType,
            consented: consent.consented,
          },
          changedFields: ["consentType", "consented"],
        });

        return jsonResponse(
          201,
          {
            data: {
              id: consent.id,
              consent_type: consent.consentType,
              consented: consent.consented,
              created_at: consent.createdAt.toISOString(),
            },
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, log, logContext);
      }
    },
  };
}
