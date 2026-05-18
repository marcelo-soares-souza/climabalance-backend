import type { HttpContext } from '../../shared/http/router';
import { errorResponse, jsonResponse } from '../../shared/http/response';
import { buildLogContext } from '../../shared/http/log-context';
import { handleError } from './error-mapper';
import { requireAuth } from '../../shared/http/auth-context';
import { withAuditLogContext } from '../../shared/http/audit-log-with-context';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { PostgresStripeConnectRepository } from '../persistence/postgres/stripe-connect-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type Stripe from 'stripe';
import { getStripeClient } from '../payments/stripe-client';
import { env } from '../../shared/utils/env';

export interface StripeConnectHandlersDeps {
  stripeConnectRepository: PostgresStripeConnectRepository;
  users: Pick<UserRepository, 'findById'>;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: Pick<AuditLogRepository, 'log'>;
  stripe?: Stripe;
}

export function createStripeConnectHandlers(
  deps: StripeConnectHandlersDeps
) {
  const stripe = deps.stripe ?? getStripeClient(env.stripeSecretKey);

  const isConnectNotEnabledError = (error: unknown): boolean => {
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';
    return (
      message.includes("signed up for Connect") ||
      message.includes("create new accounts")
    );
  };

  return {
    /**
     * POST /api/v1/producers/stripe/onboard
     * Creates a Stripe Express account and returns the onboarding URL.
     */
    async onboard(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const now = deps.clock.now();

        const existing =
          await deps.stripeConnectRepository.findByUserId(auth.userId);

        let stripeAccountId: string;

        if (existing) {
          stripeAccountId = existing.stripeAccountId;
        } else {
          const user = await deps.users.findById(auth.userId);
          if (!user) {
            return errorResponse(404, 'user.not_found', undefined, logContext);
          }

          const account = await stripe.accounts.create({
            type: 'express',
            country: 'BR',
            email: user.email,
            capabilities: {
              card_payments: { requested: true },
              transfers: { requested: true },
            },
            metadata: {
              climabalance_user_id: auth.userId,
            },
          });

          const recordId = deps.idGenerator.generate();
          await deps.stripeConnectRepository.create({
            id: recordId,
            userId: auth.userId,
            stripeAccountId: account.id,
            chargesEnabled: account.charges_enabled ?? false,
            payoutsEnabled: account.payouts_enabled ?? false,
            country: 'BR',
            createdAt: now,
            updatedAt: now,
          });

          stripeAccountId = account.id;
        }

        const accountLink = await stripe.accountLinks.create({
          account: stripeAccountId,
          refresh_url: `${env.frontendUrl}/how-to-use/stripe-setup?refresh=true`,
          return_url: `${env.frontendUrl}/how-to-use/stripe-setup?success=true`,
          type: 'account_onboarding',
        });

        await requestAuditLog.log({
          actorUserId: auth.userId,
          action: 'producer.stripe_onboarding_started',
          entityType: 'stripe_connect_account',
          entityId: stripeAccountId,
          metadata: {
            stripe_account_id: stripeAccountId,
            country: 'BR',
            account_type: 'express',
          },
        });

        return jsonResponse(
          200,
          {
            data: {
              onboarding_url: accountLink.url,
              stripe_account_id: stripeAccountId,
            },
            message_key: 'producer.stripe.onboarding_started',
          },
          logContext
        );
      } catch (error) {
        if (isConnectNotEnabledError(error)) {
          return errorResponse(
            400,
            'producer.stripe.connect_not_enabled',
            undefined,
            logContext
          );
        }
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/producers/stripe/status
     * Returns the current Stripe Connect onboarding status.
     */
    async status(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);

        const record =
          await deps.stripeConnectRepository.findByUserId(auth.userId);

        if (!record) {
          return jsonResponse(
            200,
            {
              data: {
                connected: false,
                charges_enabled: false,
                payouts_enabled: false,
              },
            },
            logContext
          );
        }

        const stripeAccount = await stripe.accounts.retrieve(
          record.stripeAccountId
        );

        const chargesEnabled =
          stripeAccount.charges_enabled ?? record.chargesEnabled;
        const payoutsEnabled =
          stripeAccount.payouts_enabled ?? record.payoutsEnabled;

        if (
          chargesEnabled !== record.chargesEnabled ||
          payoutsEnabled !== record.payoutsEnabled
        ) {
          const previousState = {
            charges_enabled: record.chargesEnabled,
            payouts_enabled: record.payoutsEnabled,
          };
          const newState = {
            charges_enabled: chargesEnabled,
            payouts_enabled: payoutsEnabled,
          };
          const changedFields: string[] = [];
          if (chargesEnabled !== record.chargesEnabled)
            changedFields.push('charges_enabled');
          if (payoutsEnabled !== record.payoutsEnabled)
            changedFields.push('payouts_enabled');

          await deps.stripeConnectRepository.updateStatus(
            record.id,
            chargesEnabled,
            payoutsEnabled,
            deps.clock.now()
          );

          await requestAuditLog.log({
            actorUserId: auth.userId,
            action: 'producer.stripe_onboarding_updated',
            entityType: 'stripe_connect_account',
            entityId: record.id,
            metadata: {
              stripe_account_id: record.stripeAccountId,
              source: 'manual_poll',
            },
            previousState,
            newState,
            changedFields,
          });
        }

        const currentlyDue = stripeAccount.requirements?.currently_due ?? [];
        const pendingVerification =
          stripeAccount.requirements?.pending_verification ?? [];
        const disabledReason =
          stripeAccount.requirements?.disabled_reason ?? null;

        let onboardingStatus: string;
        if (chargesEnabled && payoutsEnabled) {
          onboardingStatus = 'complete';
        } else if (currentlyDue.length > 0) {
          onboardingStatus = 'incomplete';
        } else if (pendingVerification.length > 0) {
          onboardingStatus = 'pending_verification';
        } else {
          onboardingStatus = 'incomplete';
        }

        return jsonResponse(
          200,
          {
            data: {
              connected: true,
              stripe_account_id: record.stripeAccountId,
              charges_enabled: chargesEnabled,
              payouts_enabled: payoutsEnabled,
              country: record.country,
              onboarding_status: onboardingStatus,
              pending_verification:
                pendingVerification.length > 0
                  ? pendingVerification
                  : undefined,
              disabled_reason: disabledReason,
            },
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/producers/stripe/dashboard
     * Returns a one-time Stripe Express dashboard login link.
     */
    async dashboard(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);

        const record =
          await deps.stripeConnectRepository.findByUserId(auth.userId);

        if (!record) {
          return errorResponse(
            404,
            'producer.stripe.not_connected',
            undefined,
            logContext
          );
        }

        if (!record.chargesEnabled || !record.payoutsEnabled) {
          return errorResponse(
            400,
            'producer.stripe.onboarding_incomplete',
            undefined,
            logContext
          );
        }

        const loginLink = await stripe.accounts.createLoginLink(
          record.stripeAccountId
        );

        await requestAuditLog.log({
          actorUserId: auth.userId,
          action: 'producer.stripe_dashboard_accessed',
          entityType: 'stripe_connect_account',
          entityId: record.id,
          metadata: {
            stripe_account_id: record.stripeAccountId,
          },
        });

        return jsonResponse(
          200,
          {
            data: {
              dashboard_url: loginLink.url,
            },
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
