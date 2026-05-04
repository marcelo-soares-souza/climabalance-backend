import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { parseWithSchema } from './schemas/validation-helper';
import { buildLogContext } from '../../shared/http/log-context';
import { handleError } from './error-mapper';
import {
  paymentWebhookSchema,
  reconcilePaymentsSchema,
  simulateCardPaymentSchema,
} from './schemas/payment-schemas';
import { createPaymentIntentSchema } from './schemas/stripe-schemas';
import { simulateCardPayment } from '../../application/payments/simulate-card-payment';
import { getPaymentStatus } from '../../application/payments/get-payment-status';
import { processPaymentWebhook } from '../../application/payments/process-payment-webhook';
import { reconcilePendingPayments } from '../../application/payments/reconcile-payments';
import {
  mapGatewayOutcomeToPaymentStatus,
  resolveCompensationStatusFromPayment,
} from '../../application/payments/payment-status';
import { createStripePaymentIntent } from '../../application/payments/create-stripe-payment-intent';
import type { StripeConnectLookup } from '../../application/payments/create-stripe-payment-intent';
import { issueCompensationCertificate } from '../../application/compensations/issue-compensation-certificate';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import type { PaymentStore } from '../../application/payments/payment-store';
import type { PaymentGatewayAdapter } from '../../application/payments/payment-gateway';
import type { CompensationCertificateRepository } from '../../domain/compensations/repositories/compensation-certificate-repository';
import type { CompensationCertificateStorage } from '../../domain/compensations/services/certificate-storage';
import type { CompensationCertificatePdfGenerator } from '../../domain/compensations/services/certificate-pdf-generator';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { JobQueue } from '../../domain/jobs/job-queue';
import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import { withAuditLogContext } from '../../shared/http/audit-log-with-context';
import { requireAuth } from '../../shared/http/auth-context';

export interface PaymentHandlersDeps {
  paymentStore: PaymentStore;
  paymentGateway: PaymentGatewayAdapter;
  compensationCertificateRepository: CompensationCertificateRepository;
  compensationCertificateStorage: CompensationCertificateStorage;
  compensationCertificatePdfGenerator: CompensationCertificatePdfGenerator;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: Pick<AuditLogRepository, 'log'>;
  jobQueue?: JobQueue;
  areaRepository?: AreaRepository;
  users?: UserRepository;
  stripeConnectLookup?: StripeConnectLookup;
  stripePlatformFeePercent?: number;
}

export function createPaymentHandlers(deps: PaymentHandlersDeps) {
  return {
    /**
     * POST /api/v1/payments/simulate
     * Simulates credit card payment for a pending compensation.
     */
    async simulate(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(simulateCardPaymentSchema, body);

        const result = await simulateCardPayment(
          {
            store: deps.paymentStore,
            paymentGateway: deps.paymentGateway,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            auditLog: requestAuditLog,
          },
          {
            actorUserId: auth.userId,
            actorRoles: auth.roles,
            compensationId: validated.compensation_id,
            cardNumber: validated.card_number,
            cardholderName: validated.cardholder_name,
            expirationMonth: validated.expiration_month,
            expirationYear: validated.expiration_year,
            cvv: validated.cvv,
            installments: validated.installments,
          }
        );
        const certificate = await ensureCertificateAfterPaidCompensation(
          deps,
          result.compensationId,
          auth.userId,
          requestAuditLog
        );

        return jsonResponse(
          201,
          {
            data: {
              payment_id: result.paymentId,
              compensation_id: result.compensationId,
              provider: result.provider,
              provider_reference: result.providerReference,
              simulation_status: result.simulationStatus,
              payment_status: result.paymentStatus,
              compensation_status: result.compensationStatus,
              amount: result.amount,
              currency: result.currency,
              installments: result.installments,
              processed_at: result.processedAt,
              certificate,
            },
            message_key: 'payment.simulated',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/payments/create-payment-intent
     * Creates a Stripe PaymentIntent (card or Pix) with Connect routing.
     */
    async createPaymentIntent(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createPaymentIntentSchema, body);

        if (!deps.areaRepository) {
          return errorResponse(
            500,
            'payment.configuration_error',
            undefined,
            logContext
          );
        }

        if (!deps.stripeConnectLookup) {
          return errorResponse(
            500,
            'payment.configuration_error',
            undefined,
            logContext
          );
        }

        const result = await createStripePaymentIntent(
          {
            store: deps.paymentStore,
            paymentGateway: deps.paymentGateway,
            areaOwnerLookup: {
              getOwnerUserId: async (areaId: string) => {
                const area = await deps.areaRepository!.findById(areaId);
                return area?.ownerUserId ?? null;
              },
            },
            stripeConnectLookup: deps.stripeConnectLookup,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            auditLog: requestAuditLog,
            platformFeePercent: deps.stripePlatformFeePercent ?? 5,
          },
          {
            actorUserId: auth.userId,
            actorRoles: auth.roles,
            compensationId: validated.compensation_id,
            paymentMethod: validated.payment_method,
          }
        );

        return jsonResponse(
          201,
          {
            data: {
              payment_id: result.paymentId,
              compensation_id: result.compensationId,
              payment_status: result.paymentStatus,
              compensation_status: result.compensationStatus,
              amount: result.amount,
              currency: result.currency,
              processed_at: result.processedAt,
              client_secret: result.clientSecret,
              qr_code: result.qrCode,
              copy_paste_code: result.copyPasteCode,
              payment_intent_id: result.paymentIntentId,
              payment_method: validated.payment_method,
            },
            message_key: 'payment.intent_created',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/payments/:id/status
     * Resolves latest gateway status and syncs payment/compensation state.
     */
    async status(ctx: HttpContext, paymentId: string) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const result = await getPaymentStatus(
          {
            store: deps.paymentStore,
            paymentGateway: deps.paymentGateway,
            clock: deps.clock,
          },
          {
            paymentId,
            actorUserId: auth.userId,
            actorRoles: auth.roles,
          }
        );
        const certificate = await ensureCertificateAfterPaidCompensation(
          deps,
          result.compensationId,
          auth.userId,
          requestAuditLog
        );

        return jsonResponse(
          200,
          {
            data: {
              payment_id: result.paymentId,
              compensation_id: result.compensationId,
              provider: result.provider,
              provider_reference: result.providerReference,
              simulation_status: result.simulationStatus,
              payment_status: result.paymentStatus,
              compensation_status: result.compensationStatus,
              amount: result.amount,
              currency: result.currency,
              processed_at: result.processedAt,
              certificate,
            },
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/payments/webhook
     * Receives gateway webhook updates and syncs payment status.
     * Supports card_simulator (HMAC) and Stripe (constructEvent).
     */
    async webhook(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const rawPayload = await readTextBody(ctx.request, 1024 * 64);

        // Determine signature header based on provider
        const isStripe =
          deps.paymentGateway.provider === 'stripe' ||
          ctx.request.headers.get('stripe-signature') !== null;

        const signature = isStripe
          ? ctx.request.headers.get('stripe-signature')
          : ctx.request.headers.get('x-payment-signature');

        const isValid = deps.paymentGateway.verifyWebhookSignature({
          payload: rawPayload,
          signature,
        });

        if (!isValid) {
          await requestAuditLog.log({
            actorUserId: 'system:webhook',
            action: 'payment.webhook_invalid_signature',
            entityType: 'webhook',
            entityId: '',
            severity: 'critical' as const,
            success: false,
            errorCode: 'invalid_signature',
          });

          return errorResponse(
            401,
            'payment.webhook_invalid_signature',
            undefined,
            logContext
          );
        }

        // For Stripe, parse the event and route to payment or account handler
        if (isStripe) {
          const stripeGateway = deps.paymentGateway as any;
          if (typeof stripeGateway.parseWebhookEvent === 'function' && signature) {
            const parsed = stripeGateway.parseWebhookEvent(rawPayload, signature);

            if (!parsed.paymentIntentId || !parsed.outcome) {
              return jsonResponse(
                202,
                {
                  data: { processed: false },
                  message_key: 'payment.webhook_processed',
                },
                logContext
              );
            }

            const result = await deps.paymentStore.runInTransaction(async (tx) => {
              const payment =
                await tx.lockPaymentByStripePaymentIntentId(
                  parsed.paymentIntentId!
                );

              if (!payment) {
                return { processed: false };
              }

              const latestPaymentStatus =
                mapGatewayOutcomeToPaymentStatus(parsed.outcome!);
              const now = deps.clock.now();

              if (latestPaymentStatus !== payment.paymentStatus) {
                await tx.updatePaymentStatus({
                  paymentId: payment.id,
                  status: latestPaymentStatus,
                  updatedAt: now,
                  paidAt: latestPaymentStatus === 'paid' ? now : undefined,
                });
              }

              const nextCompensationStatus = resolveCompensationStatusFromPayment({
                currentCompensationStatus: payment.compensationStatus,
                newPaymentStatus: latestPaymentStatus,
              });

              if (
                (nextCompensationStatus === 'pending' ||
                  nextCompensationStatus === 'paid' ||
                  nextCompensationStatus === 'canceled') &&
                payment.compensationStatus !== nextCompensationStatus
              ) {
                await tx.updateCompensationStatus({
                  compensationId: payment.compensationId,
                  status: nextCompensationStatus,
                  updatedAt: now,
                });
              }

              return {
                processed: true,
                paymentId: payment.id,
                compensationId: payment.compensationId,
                paymentStatus: latestPaymentStatus,
                compensationStatus: nextCompensationStatus,
              };
            });

            if (result.processed) {
              await requestAuditLog.log({
                actorUserId: 'system:webhook',
                action:
                  result.paymentStatus === 'paid'
                    ? 'payment.confirmed'
                    : result.paymentStatus === 'failed'
                      ? 'payment.failed'
                      : 'payment.webhook_processed',
                entityType: 'payment',
                entityId: result.paymentId!,
                metadata: {
                  stripe_payment_intent_id: parsed.paymentIntentId,
                  stripe_event_type: parsed.type,
                  payment_status: result.paymentStatus,
                  compensation_id: result.compensationId,
                },
                severity:
                  result.paymentStatus === 'failed' ? ('warning' as const) : ('info' as const),
                success: result.paymentStatus !== 'failed',
              });
            }

            const certificate =
              result.processed && result.compensationId
                ? await ensureCertificateAfterPaidCompensation(
                    deps,
                    result.compensationId!,
                    'system:webhook',
                    requestAuditLog
                  )
                : null;

            return jsonResponse(
              202,
              {
                data: {
                  processed: result.processed,
                  payment_id: result.paymentId,
                  compensation_id: result.compensationId,
                  payment_status: result.paymentStatus,
                  compensation_status: result.compensationStatus,
                  certificate,
                },
                message_key: 'payment.webhook_processed',
              },
              logContext
            );
          }
        }

        // Card simulator webhook path (unchanged)
        const parsedJson = rawPayload.length > 0 ? JSON.parse(rawPayload) : {};
        const body = parseWithSchema(paymentWebhookSchema, parsedJson);

        const result = await processPaymentWebhook(
          {
            store: deps.paymentStore,
            paymentGateway: deps.paymentGateway,
            clock: deps.clock,
            auditLog: requestAuditLog,
          },
          {
            provider: body.provider,
            providerReference: body.data?.provider_reference ?? '',
            actorUserId: 'system:webhook',
          }
        );
        const certificate =
          result.processed && result.compensationId
            ? await ensureCertificateAfterPaidCompensation(
                deps,
                result.compensationId,
                'system:webhook',
                requestAuditLog
              )
            : null;

        return jsonResponse(
          202,
          {
            data: {
              processed: result.processed,
              payment_id: result.paymentId,
              compensation_id: result.compensationId,
              payment_status: result.paymentStatus,
              compensation_status: result.compensationStatus,
              certificate,
            },
            message_key: 'payment.webhook_processed',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/payments/reconcile
     * Reconciles pending payments with gateway status.
     */
    async reconcile(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(reconcilePaymentsSchema, body ?? {});

        const result = await reconcilePendingPayments(
          {
            store: deps.paymentStore,
            paymentGateway: deps.paymentGateway,
            clock: deps.clock,
            auditLog: requestAuditLog,
          },
          {
            actorUserId: auth.userId,
            limit: validated.limit,
          }
        );
        for (const compensationId of result.paidCompensationIds) {
          const certificate = await ensureCertificateAfterPaidCompensation(
            deps,
            compensationId,
            auth.userId,
            requestAuditLog
          );

          if (certificate && deps.jobQueue && deps.areaRepository && deps.users) {
            const comp = await deps.paymentStore.getCompensationForCertificate(compensationId);
            if (comp) {
              const area = await deps.areaRepository.findById(comp.areaId);
              if (area) {
                const owner = await deps.users.findById(area.ownerUserId);
                await deps.jobQueue.enqueue('area.contribution_received', {
                  areaId: comp.areaId,
                  areaName: area.name,
                  producerEmail: owner?.email ?? '',
                  amount: comp.totalAmount,
                  currency: comp.currency,
                  treesCount: comp.treesCount,
                }).catch(() => {});
              }
            }
          }
        }

        return jsonResponse(
          200,
          {
            data: {
              inspected: result.inspected,
              updated: result.updated,
              remained_pending: result.remainedPending,
              marked_paid: result.markedPaid,
              marked_failed: result.markedFailed,
              certificates_checked: result.paidCompensationIds.length,
            },
            message_key: 'payment.reconciliation_completed',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}

async function ensureCertificateAfterPaidCompensation(
  deps: PaymentHandlersDeps,
  compensationId: string,
  actorUserId: string,
  auditLog: Pick<AuditLogRepository, 'log'>
): Promise<null | {
  id: string;
  certificate_number: string;
  authenticity_hash: string;
  validation_url: string;
  qr_code_data: string;
  file_id: string;
  file_name: string;
  mime_type: string;
  issued_at: Date;
}> {
  const compensation = await deps.paymentStore.getCompensationForCertificate(
    compensationId
  );
  if (!compensation || compensation.status !== 'paid') {
    return null;
  }

  const existing = await deps.compensationCertificateRepository.findByCompensationId(
    compensationId
  );
  if (existing) {
    return {
      id: existing.id,
      certificate_number: existing.certificateNumber,
      authenticity_hash: existing.authenticityHash ?? '',
      validation_url: existing.validationUrl ?? '',
      qr_code_data: existing.qrCodeData ?? '',
      file_id: existing.fileId,
      file_name: existing.fileName,
      mime_type: existing.mimeType,
      issued_at: existing.issuedAt ?? deps.clock.now(),
    };
  }

  try {
    const issued = await issueCompensationCertificate(
      {
        repository: deps.compensationCertificateRepository,
        storage: deps.compensationCertificateStorage,
        pdfGenerator: deps.compensationCertificatePdfGenerator,
        idGenerator: deps.idGenerator,
        clock: deps.clock,
        auditLog,
      },
      {
        compensationId: compensation.id,
        supporterUserId: compensation.supporterUserId,
        areaId: compensation.areaId,
        calculationId: compensation.calculationId ?? undefined,
        compensationMode:
          compensation.compensationMode === 'tree_purchase'
            ? 'tree_purchase'
            : 'tco2e',
        horizonYears: compensation.horizonYears ?? undefined,
        treesRequested: compensation.treesRequested ?? undefined,
        pricePerTree: compensation.pricePerTree ?? undefined,
        estimatedTotalTCO2e: compensation.estimatedTotalTCO2e ?? undefined,
        totalTCO2e: compensation.totalTCO2e,
        treesCount: compensation.treesCount,
        totalAmount: compensation.totalAmount,
        currency: compensation.currency,
      }
    );

    return {
      id: issued.certificateId,
      certificate_number: issued.certificateNumber,
      authenticity_hash: issued.authenticityHash,
      validation_url: issued.validationUrl,
      qr_code_data: issued.qrCodeData,
      file_id: issued.fileId,
      file_name: issued.fileName,
      mime_type: issued.mimeType,
      issued_at: issued.issuedAt,
    };
  } catch (error) {
    await auditLog.log({
      actorUserId,
      action: 'payment.certificate_issue_failed',
      entityType: 'compensation',
      entityId: compensationId,
      metadata: {
        reason: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}

async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      total += value.length;
      if (total > maxBytes) {
        throw new Error('payload_too_large');
      }
      chunks.push(value);
    }
  }

  if (chunks.length === 0) {
    return '';
  }

  return Buffer.concat(chunks).toString('utf-8');
}
