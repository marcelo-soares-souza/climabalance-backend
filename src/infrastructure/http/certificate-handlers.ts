import type { HttpContext } from "../../shared/http/router";
import {
  jsonResponse,
  contentDispositionHeader,
} from "../../shared/http/response";
import { handleError } from "./error-mapper";
import { buildLogContext } from "../../shared/http/log-context";
import type { CompensationCertificateRepository } from "../../domain/compensations/repositories/compensation-certificate-repository";
import type { CompensationCertificateStorage } from "../../domain/compensations/services/certificate-storage";
import type { CompensationCertificatePdfGenerator } from "../../domain/compensations/services/certificate-pdf-generator";
import type { CompensationHistoryRepository } from "../../domain/compensations/repositories/compensation-history-repository";
import { NotFoundError, ForbiddenError } from "../../domain/errors";
import { logger } from "../../shared/utils/logger";
import { parseQueryWithSchema } from "./schemas/validation-helper";
import { z } from "zod";
import { requireAuth } from "../../shared/http/auth-context";
import type { UserRepository } from "../../domain/user/user-repository";

const listCertificatesQuerySchema = z.object({
  status: z.enum(["issued", "revoked"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const validateCertificateQuerySchema = z.object({
  certificate_number: z.string().trim().min(1),
  hash: z.string().trim().min(1),
});

export interface CertificateHandlersDeps {
  users: UserRepository;
  compensationCertificateRepository: CompensationCertificateRepository;
  compensationCertificateStorage: CompensationCertificateStorage;
  compensationCertificatePdfGenerator: CompensationCertificatePdfGenerator;
  compensationHistoryRepository: CompensationHistoryRepository;
}

export function createCertificateHandlers(deps: CertificateHandlersDeps) {
  return {
    /**
     * GET /api/v1/users/:id/certificates
     * List certificates for owner or administrator.
     */
    async listByUser(ctx: HttpContext, userId: string) {
      const logContext = buildLogContext(ctx);
      try {
        const userUuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!userUuidRegex.test(userId)) {
          const user = await deps.users.findBySlug(userId);
          if (user) {
            userId = user.id;
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
        const query = parseQueryWithSchema(
          listCertificatesQuerySchema,
          ctx.query,
        );

        const certificates =
          await deps.compensationCertificateRepository.listBySupporterUserId({
            supporterUserId: userId,
            status: query.status,
            limit: query.limit ?? 20,
            offset: query.offset ?? 0,
          });

        return jsonResponse(200, { data: certificates }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/certificates/validate?certificate_number=...&hash=...
     * Public authenticity validation endpoint.
     */
    async validate(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const query = parseQueryWithSchema(
          validateCertificateQuerySchema,
          ctx.query,
        );
        const certificateNumber = query.certificate_number;
        const hash = query.hash;

        const certificate =
          await deps.compensationCertificateRepository.findByCertificateNumber(
            certificateNumber,
          );

        if (!certificate) {
          throw new NotFoundError("certificate.not_found");
        }

        const isValid =
          certificate.status === "issued" &&
          !!certificate.authenticityHash &&
          certificate.authenticityHash === hash;

        return jsonResponse(
          200,
          {
            data: {
              certificate_id: certificate.id,
              certificate_number: certificate.certificateNumber,
              compensation_id: certificate.compensationId,
              issued_at: certificate.issuedAt,
              status: certificate.status,
              is_valid: isValid,
              expected_hash: certificate.authenticityHash ?? null,
            },
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/certificates/:id/download
     * Download certificate PDF for owner or administrator.
     */
    async download(ctx: HttpContext, certificateId: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const certificate =
          await deps.compensationCertificateRepository.findById(certificateId);
        if (!certificate) {
          throw new NotFoundError("certificate.not_found");
        }

        const isAdmin = auth.roles.includes("administrator");
        const isOwner = auth.userId === certificate.supporterUserId;
        if (!isAdmin && !isOwner) {
          throw new ForbiddenError("auth.forbidden");
        }

        let bytes: Uint8Array;

        try {
          bytes = await deps.compensationCertificateStorage.read(
            certificate.storageUrl,
          );
        } catch (storageError) {
          // Fallback: regenerate certificate if file not found
          const isFileNotFound =
            storageError instanceof Error &&
            (storageError.message.includes("ENOENT") ||
              storageError.message.includes("not_found") ||
              storageError.message.includes("no such file"));

          if (!isFileNotFound) {
            throw storageError;
          }

          logger.warn("certificate.file_not_found.regenerating", {
            certificate_id: certificateId,
            storage_url: certificate.storageUrl,
            error:
              storageError instanceof Error
                ? storageError.message
                : String(storageError),
          });

          // Fetch compensation data
          const compensation =
            await deps.compensationHistoryRepository.findById(
              certificate.compensationId,
            );

          if (!compensation) {
            logger.error("certificate.compensation_not_found", {
              certificate_id: certificateId,
              compensation_id: certificate.compensationId,
            });
            throw new NotFoundError("compensation.not_found");
          }

          // Regenerate PDF
          bytes = await deps.compensationCertificatePdfGenerator.generate({
            certificateNumber: certificate.certificateNumber,
            issuedAt: certificate.issuedAt ?? new Date(),
            compensationId: certificate.compensationId,
            supporterUserId: certificate.supporterUserId,
            areaId: compensation.areaId,
            calculationId: compensation.calculationId ?? undefined,
            compensationMode: compensation.compensationMode,
            horizonYears: compensation.horizonYears ?? undefined,
            treesRequested: compensation.treesRequested ?? undefined,
            pricePerTree: compensation.pricePerTree ?? undefined,
            estimatedTotalTCO2e: compensation.estimatedTotalTCO2e ?? undefined,
            authenticityHash: certificate.authenticityHash ?? "",
            validationUrl: certificate.validationUrl ?? "",
            qrCodeData: certificate.qrCodeData ?? "",
            totalTCO2e: compensation.totalTCO2e,
            treesCount: compensation.treesCount ?? 0,
            totalAmount: compensation.totalAmount,
            currency: compensation.currency,
          });

          // Save regenerated file
          await deps.compensationCertificateStorage.save({
            certificateId,
            bytes,
          });

          logger.info("certificate.regenerated", {
            certificate_id: certificateId,
            file_size_bytes: bytes.byteLength,
          });
        }

        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": certificate.mimeType || "application/pdf",
            "content-length": String(bytes.byteLength),
            "content-disposition": contentDispositionHeader(
              "inline",
              certificate.fileName,
            ),
            "cache-control": "private, max-age=300",
          },
        });
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
