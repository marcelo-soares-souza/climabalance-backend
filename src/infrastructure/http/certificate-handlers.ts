import type { HttpContext } from '../../shared/http/router';
import { jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import { buildLogContext } from '../../shared/http/log-context';
import type { CompensationCertificateRepository } from '../../domain/compensations/repositories/compensation-certificate-repository';
import type { CompensationCertificateStorage } from '../../domain/compensations/services/certificate-storage';
import { NotFoundError, ValidationError, ForbiddenError } from '../../domain/errors';

export interface CertificateHandlersDeps {
  compensationCertificateRepository: CompensationCertificateRepository;
  compensationCertificateStorage: CompensationCertificateStorage;
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

        const bytes = await deps.compensationCertificateStorage.read(
          certificate.storageUrl
        );

        return new Response(bytes, {
          status: 200,
          headers: {
            'content-type': certificate.mimeType || 'application/pdf',
            'content-length': String(bytes.byteLength),
            'content-disposition': `inline; filename="${certificate.fileName}"`,
            'cache-control': 'private, max-age=300',
          },
        });
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
