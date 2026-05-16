import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { parseWithSchema } from './schemas/validation-helper';
import { buildLogContext } from '../../shared/http/log-context';
import { getLogger } from '../../shared/utils/logger';
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
import type { PostgresStripeConnectRepository } from '../persistence/postgres/stripe-connect-repository';
import { getStripeClient } from '../payments/stripe-client';
import { env } from '../../shared/utils/env';

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
  stripeConnectRepository?: PostgresStripeConnectRepository;
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

        const compensation = await deps.paymentStore.getCompensationForCertificate(
          validated.compensation_id
        );
        if (compensation && deps.areaRepository && deps.stripeConnectRepository) {
          const area = await deps.areaRepository.findById(compensation.areaId);
          if (area?.ownerUserId) {
            await syncStripeConnectStatusForOwner(
              deps.stripeConnectRepository,
              area.ownerUserId,
              deps.clock.now()
            );
          }
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

        const logger = getLogger(logContext);
        logger.info('payment.webhook_received', {
          provider: isStripe ? 'stripe' : 'card_simulator',
          has_signature: !!signature,
          signature_prefix: signature ? `${signature.slice(0, 12)}...` : null,
          content_length: rawPayload.length,
          content_type: ctx.request.headers.get('content-type') ?? null,
        });

        const isValid = await deps.paymentGateway.verifyWebhookSignature({
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
            const parsed = await stripeGateway.parseWebhookEvent(rawPayload, signature);

            logger.info('payment.webhook_stripe_event', {
              event_id: parsed.eventId,
              event_type: parsed.type,
              payment_intent_id: parsed.paymentIntentId ?? null,
              has_outcome: !!parsed.outcome,
            });

            const registered = await registerWebhookEventIfNew(
              deps,
              'stripe',
              parsed.eventId,
              parsed.type
            );
            if (!registered) {
              await requestAuditLog.log({
                actorUserId: 'system:webhook',
                action: 'payment.webhook_duplicate_discarded',
                entityType: 'stripe_event',
                entityId: parsed.eventId,
                metadata: { stripe_event_type: parsed.type },
                severity: 'info' as const,
                success: true,
              });
              return jsonResponse(
                202,
                {
                  data: { processed: true, deduplicated: true },
                  message_key: 'payment.webhook_processed',
                },
                logContext
              );
            }

            if (parsed.type === 'charge.refunded' && parsed.paymentIntentId) {
              const refundResult = await deps.paymentStore.runInTransaction(async (tx) => {
                const payment = await tx.lockPaymentByStripePaymentIntentId(parsed.paymentIntentId!);
                if (!payment) {
                  await requestAuditLog.log({
                    actorUserId: 'system:webhook',
                    action: 'payment.webhook_payment_not_found',
                    entityType: 'stripe_payment_intent',
                    entityId: parsed.paymentIntentId!,
                    metadata: { stripe_event_type: parsed.type },
                    severity: 'warning' as const,
                    success: false,
                    errorCode: 'PAYMENT_NOT_FOUND',
                  });
                  return { processed: false };
                }
                const now = deps.clock.now();
                await tx.updatePaymentStatus({ paymentId: payment.id, status: 'refunded', updatedAt: now });
                await tx.updateCompensationStatus({ compensationId: payment.compensationId, status: 'refunded', updatedAt: now });
                return { processed: true, paymentId: payment.id, compensationId: payment.compensationId };
              });

              if (refundResult.processed) {
                await requestAuditLog.log({
                  actorUserId: 'system:webhook',
                  action: 'payment.refunded',
                  entityType: 'payment',
                  entityId: refundResult.paymentId!,
                  metadata: { stripe_event_type: parsed.type, compensation_id: refundResult.compensationId },
                  severity: 'warning' as const,
                  success: true,
                });
                if (deps.jobQueue && deps.areaRepository && deps.users) {
                  notifyContributionRefunded(deps, refundResult.compensationId!).catch(() => {});
                }
              }

              return jsonResponse(202, {
                data: { processed: refundResult.processed },
                message_key: 'payment.webhook_processed',
              }, logContext);
            }

            if (!parsed.paymentIntentId || !parsed.outcome) {
              const accountUpdateProcessed =
                await handleStripeAccountUpdatedWebhook(
                  deps,
                  requestAuditLog,
                  rawPayload,
                  signature,
                  parsed.type
                );
              if (accountUpdateProcessed) {
                return jsonResponse(
                  202,
                  {
                    data: { processed: true },
                    message_key: 'payment.webhook_processed',
                  },
                  logContext
                );
              }

              await requestAuditLog.log({
                actorUserId: 'system:webhook',
                action: 'payment.webhook_unhandled_type',
                entityType: 'stripe_event',
                entityId: parsed.eventId,
                metadata: {
                  stripe_event_type: parsed.type,
                  payment_intent_id: parsed.paymentIntentId ?? null,
                },
                severity: 'warning' as const,
                success: false,
                errorCode: 'UNHANDLED_EVENT_TYPE',
              });

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
                await requestAuditLog.log({
                  actorUserId: 'system:webhook',
                  action: 'payment.webhook_payment_not_found',
                  entityType: 'stripe_payment_intent',
                  entityId: parsed.paymentIntentId!,
                  metadata: { stripe_event_type: parsed.type },
                  severity: 'warning' as const,
                  success: false,
                  errorCode: 'PAYMENT_NOT_FOUND',
                });
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

              if (result.paymentStatus === 'failed' && deps.jobQueue && deps.users && result.compensationId) {
                const comp = await deps.paymentStore.getCompensationForCertificate(result.compensationId);
                if (comp) {
                  const supporter = await deps.users.findById(comp.supporterUserId);
                  if (supporter) {
                    await deps.jobQueue.enqueue('notification.payment_failed', {
                      email: supporter.email,
                      amount: comp.totalAmount,
                      currency: comp.currency,
                      locale: supporter.locale,
                      frontendUrl: env.frontendUrl,
                    }).catch(() => {});
                  }
                }
              }
            }

            const certificate =
              result.processed && result.compensationId
                ? await ensureCertificateAfterPaidCompensation(
                    deps,
                    result.compensationId,
                    'system:webhook',
                    requestAuditLog
                  )
                : null;

            if (result.paymentStatus === 'paid' && deps.jobQueue && deps.areaRepository && deps.users) {
              notifyCompensationMilestone(deps, result.compensationId!).catch(() => {});
            }

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

        // Card simulator webhook path
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

        if (result.paymentStatus === 'failed' && deps.jobQueue && deps.users && result.compensationId) {
          const comp = await deps.paymentStore.getCompensationForCertificate(result.compensationId);
          if (comp) {
            const supporter = await deps.users.findById(comp.supporterUserId);
            if (supporter) {
              await deps.jobQueue.enqueue('notification.payment_failed', {
                email: supporter.email,
                amount: comp.totalAmount,
                currency: comp.currency,
                locale: supporter.locale,
                frontendUrl: env.frontendUrl,
              }).catch(() => {});
            }
          }
        }

        const certificate =
          result.processed && result.compensationId
            ? await ensureCertificateAfterPaidCompensation(
                deps,
                result.compensationId,
                'system:webhook',
                requestAuditLog
              )
            : null;

        if (result.paymentStatus === 'paid' && deps.jobQueue && deps.areaRepository && deps.users) {
          notifyCompensationMilestone(deps, result.compensationId!).catch(() => {});
        }

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
          await ensureCertificateAfterPaidCompensation(
            deps,
            compensationId,
            auth.userId,
            requestAuditLog
          );

          if (deps.jobQueue && deps.areaRepository && deps.users) {
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
                if (area.carbonCapacity) {
                  const contributionShare = (comp.totalTCO2e / area.carbonCapacity.totalCapacityTCO2e) * 100;
                  const utilization = area.carbonCapacity.utilizationPercentage;
                  const prevUtilization = utilization - contributionShare;
                  const milestones = [50, 75, 100];
                  for (const milestone of milestones) {
                    if (utilization >= milestone && prevUtilization < milestone) {
                      await deps.jobQueue.enqueue('area.compensation_milestone', {
                        areaId: comp.areaId,
                        areaName: area.name,
                        producerEmail: owner?.email ?? '',
                        percentage: milestone,
                      }).catch(() => {});
                      break;
                    }
                  }
                }
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

async function syncStripeConnectStatusForOwner(
  stripeConnectRepository: PostgresStripeConnectRepository,
  ownerUserId: string,
  now: Date
): Promise<void> {
  const record = await stripeConnectRepository.findByUserId(ownerUserId);
  if (!record) return;

  if (!env.stripeSecretKey.trim()) return;
  const stripe = getStripeClient(env.stripeSecretKey);
  const stripeAccount = await stripe.accounts.retrieve(record.stripeAccountId);
  const chargesEnabled = stripeAccount.charges_enabled ?? record.chargesEnabled;
  const payoutsEnabled = stripeAccount.payouts_enabled ?? record.payoutsEnabled;

  if (
    chargesEnabled !== record.chargesEnabled ||
    payoutsEnabled !== record.payoutsEnabled
  ) {
    await stripeConnectRepository.updateStatus(
      record.id,
      chargesEnabled,
      payoutsEnabled,
      now
    );
  }
}

async function handleStripeAccountUpdatedWebhook(
  deps: PaymentHandlersDeps,
  auditLog: Pick<AuditLogRepository, 'log'>,
  rawPayload: string,
  signature: string,
  parsedEventType: string
): Promise<boolean> {
  if (!deps.stripeConnectRepository || !env.stripeSecretKey.trim()) {
    return false;
  }

  const stripe = getStripeClient(env.stripeSecretKey);
  const event = await stripe.webhooks.constructEventAsync(
    rawPayload,
    signature,
    env.stripeWebhookSecret
  );

  if (parsedEventType !== 'account.updated' || event.type !== 'account.updated') {
    return false;
  }

  const account = event.data.object as {
    id?: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    requirements?: { disabled_reason?: string | null; currently_due?: string[] };
  };

  const stripeAccountId = typeof account.id === 'string' ? account.id : '';
  if (!stripeAccountId) {
    return false;
  }

  const record =
    await deps.stripeConnectRepository.findByStripeAccountId(stripeAccountId);
  if (!record) {
    return true;
  }

  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const changed =
    chargesEnabled !== record.chargesEnabled ||
    payoutsEnabled !== record.payoutsEnabled;

  if (changed) {
    await deps.stripeConnectRepository.updateStatus(
      record.id,
      chargesEnabled,
      payoutsEnabled,
      deps.clock.now()
    );
  }

  await auditLog.log({
    actorUserId: 'system:webhook',
    action: 'producer.stripe_onboarding_updated',
    entityType: 'stripe_connect_account',
    entityId: record.id,
    metadata: {
      stripe_account_id: stripeAccountId,
      source: 'stripe_webhook',
      stripe_event_type: event.type,
    },
    previousState: {
      charges_enabled: record.chargesEnabled,
      payouts_enabled: record.payoutsEnabled,
    },
    newState: {
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
    },
    changedFields: [
      ...(chargesEnabled !== record.chargesEnabled ? ['charges_enabled'] : []),
      ...(payoutsEnabled !== record.payoutsEnabled ? ['payouts_enabled'] : []),
    ],
  });

  // Detect onboarding failure and notify producer
  const disabledReason = account.requirements?.disabled_reason ?? null;
  if (disabledReason) {
    await auditLog.log({
      actorUserId: 'system:webhook',
      action: 'producer.stripe_onboarding_failed',
      entityType: 'stripe_connect_account',
      entityId: record.id,
      metadata: {
        stripe_account_id: stripeAccountId,
        disabled_reason: disabledReason,
      },
      severity: 'error' as const,
      success: false,
      errorCode: 'STRIPE_ONBOARDING_FAILED',
    });

    if (deps.jobQueue && deps.users) {
      const user = await deps.users.findById(record.userId);
      if (user) {
        const profile = await deps.users.getProfile(record.userId);
        await deps.jobQueue.enqueue('stripe.onboarding_failed', {
          email: user.email,
          producerName: profile?.displayName ?? user.email,
          reason: disabledReason,
        }).catch(() => {});
      }
    }
  }

  return true;
}

async function registerWebhookEventIfNew(
  deps: PaymentHandlersDeps,
  provider: string,
  eventId: string,
  eventType: string
): Promise<boolean> {
  if (typeof deps.paymentStore.markWebhookEventProcessed !== 'function') {
    return true;
  }

  return deps.paymentStore.markWebhookEventProcessed({
    provider,
    eventId,
    eventType,
    processedAt: deps.clock.now(),
  });
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

    if (deps.jobQueue && deps.users) {
      const supporter = await deps.users.findById(compensation.supporterUserId);
      if (supporter) {
        await deps.jobQueue.enqueue('notification.certificate_issued', {
          email: supporter.email,
          certificateNumber: issued.certificateNumber,
          locale: supporter.locale,
          frontendUrl: env.frontendUrl,
        }).catch(() => {});
      }
    }

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

async function notifyContributionRefunded(
  deps: PaymentHandlersDeps,
  compensationId: string
): Promise<void> {
  if (!deps.jobQueue || !deps.areaRepository || !deps.users) return;
  const comp = await deps.paymentStore.getCompensationForCertificate(compensationId);
  if (!comp) return;
  const area = await deps.areaRepository.findById(comp.areaId);
  if (!area) return;
  const owner = await deps.users.findById(area.ownerUserId);
  if (!owner) return;
  await deps.jobQueue.enqueue('contribution.refunded', {
    areaId: comp.areaId,
    areaName: area.name,
    producerEmail: owner.email,
    amount: comp.totalAmount,
    currency: comp.currency,
  }).catch(() => {});
}

async function notifyCompensationMilestone(
  deps: PaymentHandlersDeps,
  compensationId: string
): Promise<void> {
  if (!deps.jobQueue || !deps.areaRepository || !deps.users) return;
  const comp = await deps.paymentStore.getCompensationForCertificate(compensationId);
  if (!comp) return;
  const area = await deps.areaRepository.findById(comp.areaId);
  if (!area || !area.carbonCapacity) return;
  const utilization = area.carbonCapacity.utilizationPercentage;
  const contributionShare = (comp.totalTCO2e / area.carbonCapacity.totalCapacityTCO2e) * 100;
  const prevUtilization = utilization - contributionShare;
  const milestones = [50, 75, 100];
  for (const milestone of milestones) {
    if (utilization >= milestone && prevUtilization < milestone) {
      const owner = await deps.users.findById(area.ownerUserId);
      if (!owner) return;
      await deps.jobQueue.enqueue('area.compensation_milestone', {
        areaId: comp.areaId,
        areaName: area.name,
        producerEmail: owner.email,
        percentage: milestone,
      }).catch(() => {});
      break;
    }
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
