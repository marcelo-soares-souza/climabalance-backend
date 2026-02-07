import type { PaymentGatewayAdapter } from './payment-gateway';
import {
  mapGatewayOutcomeToPaymentStatus,
  resolveCompensationStatusFromPayment,
} from './payment-status';
import type { PaymentStore } from './payment-store';

/**
 * Input payload received from webhook transport layer.
 */
export type ProcessPaymentWebhookInput = {
  provider: string;
  providerReference: string;
  actorUserId: string;
};

/**
 * Result of webhook processing and local-state synchronization.
 */
export type ProcessPaymentWebhookResult = {
  processed: boolean;
  paymentId?: string;
  compensationId?: string;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  compensationStatus?: 'pending' | 'paid' | 'canceled' | 'refunded';
};

/**
 * Processes gateway webhook events in an idempotent transaction.
 */
export async function processPaymentWebhook(
  deps: {
    store: PaymentStore;
    paymentGateway: PaymentGatewayAdapter;
    clock: { now(): Date };
    auditLog: {
      log(entry: {
        actorUserId: string;
        action: string;
        entityType: string;
        entityId: string;
        metadata?: Record<string, any>;
      }): Promise<void>;
    };
  },
  input: ProcessPaymentWebhookInput
): Promise<ProcessPaymentWebhookResult> {
  if (input.provider !== deps.paymentGateway.provider) {
    return { processed: false };
  }

  const now = deps.clock.now();

  const result = await deps.store.runInTransaction(async (tx) => {
    const payment = await tx.lockPaymentByProviderReference({
      provider: input.provider,
      providerReference: input.providerReference,
    });

    if (!payment) {
      return { processed: false } as ProcessPaymentWebhookResult;
    }

    const gatewayStatus = await deps.paymentGateway.getChargeStatus({
      providerReference: payment.providerReference,
    });

    const latestPaymentStatus = mapGatewayOutcomeToPaymentStatus(gatewayStatus.outcome);

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
      if (nextCompensationStatus === 'canceled') {
        await tx.releaseAreaCommitmentForCompensation({
          compensationId: payment.compensationId,
          updatedAt: now,
        });
      }
    }

    return {
      processed: true,
      paymentId: payment.id,
      compensationId: payment.compensationId,
      paymentStatus: latestPaymentStatus,
      compensationStatus:
        nextCompensationStatus === 'paid' ||
        nextCompensationStatus === 'pending' ||
        nextCompensationStatus === 'canceled'
          ? nextCompensationStatus
          : payment.compensationStatus,
    } satisfies ProcessPaymentWebhookResult;
  });

  if (result.processed && result.paymentId) {
    await deps.auditLog.log({
      actorUserId: input.actorUserId,
      action: 'payment.webhook_processed',
      entityType: 'payment',
      entityId: result.paymentId,
      metadata: {
        provider: input.provider,
        provider_reference: input.providerReference,
        payment_status: result.paymentStatus,
        compensation_id: result.compensationId,
        compensation_status: result.compensationStatus,
      },
    });
  }

  return result;
}
