import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import type { PaymentGatewayAdapter } from './payment-gateway';
import { mapGatewayOutcomeToPaymentStatus } from './payment-status';
import type { PaymentStore } from './payment-store';

/**
 * Input payload for simulating a credit-card payment.
 */
export type SimulateCardPaymentInput = {
  actorUserId: string;
  actorRoles: string[];
  compensationId: string;
  cardNumber: string;
  cardholderName: string;
  expirationMonth: number;
  expirationYear: number;
  cvv: string;
  installments: number;
};

/**
 * Payment simulator outcomes mirrored from gateway behavior.
 */
export type CardSimulationOutcome =
  | 'authorized'
  | 'declined'
  | 'in_review'
  | 'timeout'
  | 'canceled';

/**
 * Result returned after simulation and local state synchronization.
 */
export type SimulateCardPaymentResult = {
  paymentId: string;
  compensationId: string;
  provider: string;
  providerReference: string;
  simulationStatus: CardSimulationOutcome;
  paymentStatus: 'pending' | 'paid' | 'failed';
  amount: number;
  currency: string;
  installments: number;
  processedAt: Date;
  compensationStatus: 'pending' | 'paid' | 'canceled' | 'refunded';
};

/**
 * Simulates a card payment and synchronizes payment/compensation status atomically.
 */
export async function simulateCardPayment(
  deps: {
    store: PaymentStore;
    paymentGateway: PaymentGatewayAdapter;
    idGenerator: { generate(): string };
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
  input: SimulateCardPaymentInput
): Promise<SimulateCardPaymentResult> {
  validateInput(input);

  const now = deps.clock.now();
  const paymentId = deps.idGenerator.generate();
  const normalizedCardNumber = normalizeDigits(input.cardNumber);

  const result = await deps.store.runInTransaction(async (tx) => {
    const compensation = await tx.lockCompensation(input.compensationId);
    if (!compensation) {
      throw new NotFoundError('compensation.not_found');
    }

    const isAdmin = input.actorRoles.includes('administrator');
    const isOwner = compensation.supporterUserId === input.actorUserId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('auth.forbidden');
    }

    if (compensation.status !== 'pending') {
      throw new ValidationError([
        { field: 'compensation_id', message: 'invalid_compensation_status' },
      ]);
    }

    const gatewayResult = await deps.paymentGateway.createCharge({
      paymentId,
      compensationId: compensation.id,
      amount: compensation.totalAmount,
      currency: compensation.currency,
      cardNumber: normalizedCardNumber,
      cardholderName: input.cardholderName,
      expirationMonth: input.expirationMonth,
      expirationYear: input.expirationYear,
      cvv: normalizeDigits(input.cvv),
      installments: input.installments,
    });

    const paymentStatus = mapGatewayOutcomeToPaymentStatus(gatewayResult.outcome);

    await tx.insertPayment({
      id: paymentId,
      compensationId: compensation.id,
      provider: gatewayResult.provider,
      providerReference: gatewayResult.providerReference,
      amount: compensation.totalAmount,
      currency: compensation.currency,
      status: paymentStatus,
      paidAt: paymentStatus === 'paid' ? gatewayResult.processedAt : undefined,
      createdAt: now,
      updatedAt: now,
    });

    let compensationStatus: 'pending' | 'paid' | 'canceled' | 'refunded' =
      compensation.status;
    if (paymentStatus === 'paid') {
      await tx.updateCompensationStatus({
        compensationId: compensation.id,
        status: 'paid',
        updatedAt: now,
      });
      compensationStatus = 'paid';
    } else if (paymentStatus === 'failed' && compensation.status === 'pending') {
      await tx.updateCompensationStatus({
        compensationId: compensation.id,
        status: 'canceled',
        updatedAt: now,
      });
      await tx.releaseAreaCommitmentForCompensation({
        compensationId: compensation.id,
        updatedAt: now,
      });
      compensationStatus = 'canceled';
    }

    return {
      paymentId,
      compensationId: compensation.id,
      provider: gatewayResult.provider,
      providerReference: gatewayResult.providerReference,
      simulationStatus: gatewayResult.outcome,
      paymentStatus: paymentStatus as 'pending' | 'paid' | 'failed',
      amount: compensation.totalAmount,
      currency: compensation.currency,
      installments: input.installments,
      processedAt: gatewayResult.processedAt,
      compensationStatus,
    };
  });

  await deps.auditLog.log({
    actorUserId: input.actorUserId,
    action: 'payment.simulated',
    entityType: 'payment',
    entityId: result.paymentId,
    metadata: {
      compensation_id: result.compensationId,
      provider: result.provider,
      provider_reference: result.providerReference,
      simulation_status: result.simulationStatus,
      payment_status: result.paymentStatus,
      compensation_status: result.compensationStatus,
      amount: result.amount,
      currency: result.currency,
      installments: result.installments,
    },
  });

  return result;
}

/**
 * Validates simulation payload rules before touching persistence/gateway.
 */
function validateInput(input: SimulateCardPaymentInput): void {
  const errors: Array<{ field: string; message: string }> = [];
  const cardNumber = normalizeDigits(input.cardNumber);
  const cvv = normalizeDigits(input.cvv);

  if (!input.compensationId.trim()) {
    errors.push({ field: 'compensation_id', message: 'required' });
  }
  if (!input.cardholderName.trim()) {
    errors.push({ field: 'cardholder_name', message: 'required' });
  }
  if (!/^\d{13,19}$/.test(cardNumber)) {
    errors.push({ field: 'card_number', message: 'invalid_card_number' });
  }
  if (!/^\d{3,4}$/.test(cvv)) {
    errors.push({ field: 'cvv', message: 'invalid_cvv' });
  }
  if (!Number.isInteger(input.expirationMonth) || input.expirationMonth < 1 || input.expirationMonth > 12) {
    errors.push({ field: 'expiration_month', message: 'invalid_month' });
  }

  const nowYear = new Date().getUTCFullYear();
  if (
    !Number.isInteger(input.expirationYear) ||
    input.expirationYear < nowYear ||
    input.expirationYear > nowYear + 20
  ) {
    errors.push({ field: 'expiration_year', message: 'invalid_year' });
  }

  if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 12) {
    errors.push({ field: 'installments', message: 'invalid_installments' });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

/**
 * Keeps only numeric digits from card and CVV inputs.
 */
function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}
