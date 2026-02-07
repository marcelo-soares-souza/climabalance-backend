import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import type { PaymentGatewayAdapter } from './payment-gateway';
import {
  mapGatewayOutcomeToPaymentStatus,
  resolveCompensationStatusFromPayment,
} from './payment-status';
import type { PaymentStore } from './payment-store';

/**
 * Input for querying payment status by id.
 */
export type GetPaymentStatusInput = {
  paymentId: string;
  actorUserId: string;
  actorRoles: string[];
};

/**
 * Latest payment/compensation state after sync with gateway.
 */
export type GetPaymentStatusResult = {
  paymentId: string;
  compensationId: string;
  provider: string;
  providerReference: string;
  simulationStatus: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  compensationStatus: 'pending' | 'paid' | 'canceled' | 'refunded';
  amount: number;
  currency: string;
  processedAt: Date;
};

/**
 * Reads payment status from gateway and reconciles local payment/compensation state.
 */
export async function getPaymentStatus(
  deps: {
    store: PaymentStore;
    paymentGateway: PaymentGatewayAdapter;
    clock: { now(): Date };
  },
  input: GetPaymentStatusInput
): Promise<GetPaymentStatusResult> {
  const now = deps.clock.now();

  return deps.store.runInTransaction(async (tx) => {
    const payment = await tx.lockPaymentById(input.paymentId);
    if (!payment) {
      throw new NotFoundError('payment.not_found');
    }

    const isAdmin = input.actorRoles.includes('administrator');
    const isOwner = payment.supporterUserId === input.actorUserId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('auth.forbidden');
    }

    if (payment.provider !== deps.paymentGateway.provider) {
      throw new ValidationError([
        { field: 'provider', message: 'unsupported_provider' },
      ]);
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
      paymentId: payment.id,
      compensationId: payment.compensationId,
      provider: payment.provider,
      providerReference: payment.providerReference,
      simulationStatus: gatewayStatus.outcome,
      paymentStatus: latestPaymentStatus,
      compensationStatus:
        nextCompensationStatus === 'paid' ||
        nextCompensationStatus === 'pending' ||
        nextCompensationStatus === 'canceled'
          ? nextCompensationStatus
          : payment.compensationStatus,
      amount: payment.amount,
      currency: payment.currency,
      processedAt: gatewayStatus.processedAt,
    };
  });
}
