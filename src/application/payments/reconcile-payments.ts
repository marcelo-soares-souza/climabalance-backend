import type { PaymentGatewayAdapter } from './payment-gateway';
import {
  mapGatewayOutcomeToPaymentStatus,
  resolveCompensationStatusFromPayment,
} from './payment-status';
import type { PaymentStore } from './payment-store';

/**
 * Input payload for scheduled/manual reconciliation runs.
 */
export type ReconcilePendingPaymentsInput = {
  actorUserId: string;
  limit: number;
};

/**
 * Aggregated reconciliation counters for operational monitoring.
 */
export type ReconcilePendingPaymentsResult = {
  inspected: number;
  updated: number;
  remainedPending: number;
  markedPaid: number;
  markedFailed: number;
  paidCompensationIds: string[];
};

/**
 * Reconciles pending local payments with gateway status.
 */
export async function reconcilePendingPayments(
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
  input: ReconcilePendingPaymentsInput
): Promise<ReconcilePendingPaymentsResult> {
  const pendingPayments = await deps.store.listPendingPayments(input.limit);
  const now = deps.clock.now();

  let inspected = 0;
  let updated = 0;
  let remainedPending = 0;
  let markedPaid = 0;
  let markedFailed = 0;
  const paidCompensationIds: string[] = [];

  for (const payment of pendingPayments) {
    inspected += 1;

    if (payment.provider !== deps.paymentGateway.provider) {
      remainedPending += 1;
      continue;
    }

    const gatewayStatus = await deps.paymentGateway.getChargeStatus({
      providerReference: payment.providerReference,
    });
    const latestPaymentStatus = mapGatewayOutcomeToPaymentStatus(gatewayStatus.outcome);

    if (latestPaymentStatus === 'pending') {
      remainedPending += 1;
      continue;
    }

    await deps.store.runInTransaction(async (tx) => {
      const locked = await tx.lockPaymentById(payment.id);
      if (!locked || locked.paymentStatus !== 'pending') {
        return;
      }

      await tx.updatePaymentStatus({
        paymentId: locked.id,
        status: latestPaymentStatus,
        updatedAt: now,
        paidAt: latestPaymentStatus === 'paid' ? now : undefined,
      });

      const nextCompensationStatus = resolveCompensationStatusFromPayment({
        currentCompensationStatus: locked.compensationStatus,
        newPaymentStatus: latestPaymentStatus,
      });

      if (
        (nextCompensationStatus === 'pending' ||
          nextCompensationStatus === 'paid' ||
          nextCompensationStatus === 'canceled') &&
        locked.compensationStatus !== nextCompensationStatus
      ) {
        await tx.updateCompensationStatus({
          compensationId: locked.compensationId,
          status: nextCompensationStatus,
          updatedAt: now,
        });
      }
    });

    updated += 1;
    if (latestPaymentStatus === 'paid') {
      markedPaid += 1;
      paidCompensationIds.push(payment.compensationId);
    } else {
      markedFailed += 1;
    }
  }

  await deps.auditLog.log({
    actorUserId: input.actorUserId,
    action: 'payment.reconciliation_ran',
    entityType: 'payment',
    entityId: 'batch',
    metadata: {
      inspected,
      updated,
      remained_pending: remainedPending,
      marked_paid: markedPaid,
      marked_failed: markedFailed,
      limit: input.limit,
    },
  });

  return {
    inspected,
    updated,
    remainedPending,
    markedPaid,
    markedFailed,
    paidCompensationIds,
  };
}
