import type { HttpContext } from '../../shared/http/router';
import { jsonResponse, contentDispositionHeader } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { buildLogContext } from '../../shared/http/log-context';
import type { CompensationCertificateRepository } from '../../domain/compensations/repositories/compensation-certificate-repository';
import type { CompensationCertificateStorage } from '../../domain/compensations/services/certificate-storage';
import type { CompensationCertificatePdfGenerator } from '../../domain/compensations/services/certificate-pdf-generator';
import type { CompensationHistoryRepository } from '../../domain/compensations/repositories/compensation-history-repository';
import { NotFoundError, ValidationError, ForbiddenError } from '../../domain/errors';
import { logger } from '../../shared/utils/logger';

export interface CertificateHandlersDeps {
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
        const url = new URL(ctx.request.url);
        const statusRaw = url.searchParams.get('status')?.trim().toLowerCase();
        const status =
          statusRaw === 'issued' || statusRaw === 'revoked'
            ? (statusRaw as 'issued' | 'revoked')
            : undefined;
        const limitRaw = Number(url.searchParams.get('limit') ?? '20');
        const offsetRaw = Number(url.searchParams.get('offset') ?? '0');
        const limit = Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 20;
        const offset = Number.isFinite(offsetRaw) ? Math.trunc(offsetRaw) : 0;

        const certificates =
          await deps.compensationCertificateRepository.listBySupporterUserId({
            supporterUserId: userId,
            status,
            limit,
            offset,
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
        const url = new URL(ctx.request.url);
        const certificateNumber = url.searchParams.get('certificate_number');
        const hash = url.searchParams.get('hash');

        if (!certificateNumber || !hash) {
          throw new ValidationError([
            { field: 'certificate_number', message: 'required' },
            { field: 'hash', message: 'required' },
          ]);
        }

        const certificate =
          await deps.compensationCertificateRepository.findByCertificateNumber(
            certificateNumber
          );

        if (!certificate) {
          throw new NotFoundError('certificate.not_found');
        }

        const isValid =
          certificate.status === 'issued' &&
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
          logContext
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
        const certificate = await deps.compensationCertificateRepository.findById(
          certificateId
        );
        if (!certificate) {
          throw new NotFoundError('certificate.not_found');
        }

        const isAdmin = ctx.auth!.roles.includes('administrator');
        const isOwner = ctx.auth!.userId === certificate.supporterUserId;
        if (!isAdmin && !isOwner) {
          throw new ForbiddenError('auth.forbidden');
        }

        let bytes: Uint8Array;

        try {
          bytes = await deps.compensationCertificateStorage.read(
            certificate.storageUrl
          );
        } catch (storageError) {
          // Fallback: regenerate certificate if file not found
          const isFileNotFound =
            storageError instanceof Error &&
            (storageError.message.includes('ENOENT') ||
              storageError.message.includes('not_found') ||
              storageError.message.includes('no such file'));

          if (!isFileNotFound) {
            throw storageError;
          }

          logger.warn('certificate.file_not_found.regenerating', {
            certificate_id: certificateId,
            storage_url: certificate.storageUrl,
            error: storageError instanceof Error ? storageError.message : String(storageError),
          });

          // Fetch compensation data
          const compensation = await deps.compensationHistoryRepository.findById(
            certificate.compensationId
          );

          if (!compensation) {
            logger.error('certificate.compensation_not_found', {
              certificate_id: certificateId,
              compensation_id: certificate.compensationId,
            });
            throw new NotFoundError('compensation.not_found');
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
            authenticityHash: certificate.authenticityHash ?? '',
            validationUrl: certificate.validationUrl ?? '',
            qrCodeData: certificate.qrCodeData ?? '',
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

          logger.info('certificate.regenerated', {
            certificate_id: certificateId,
            file_size_bytes: bytes.byteLength,
          });
        }

        return new Response(bytes, {
          status: 200,
          headers: {
            'content-type': certificate.mimeType || 'application/pdf',
            'content-length': String(bytes.byteLength),
            'content-disposition': contentDispositionHeader('inline', certificate.fileName),
            'cache-control': 'private, max-age=300',
          },
        });
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
