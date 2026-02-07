import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';

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

export type CardSimulationOutcome =
  | 'authorized'
  | 'declined'
  | 'in_review'
  | 'timeout'
  | 'canceled';

export type SimulateCardPaymentResult = {
  paymentId: string;
  compensationId: string;
  provider: 'card_simulator';
  providerReference: string;
  simulationStatus: CardSimulationOutcome;
  paymentStatus: 'pending' | 'paid' | 'failed';
  amount: number;
  currency: string;
  installments: number;
  processedAt: Date;
  compensationStatus: 'pending' | 'paid';
};

export type PaymentCompensationSnapshot = {
  id: string;
  supporterUserId: string;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'paid' | 'canceled' | 'refunded';
};

export type PaymentCreateRecord = {
  id: string;
  compensationId: string;
  provider: string;
  providerReference: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export interface PaymentSimulationTransaction {
  lockCompensation(compensationId: string): Promise<PaymentCompensationSnapshot | null>;
  insertPayment(record: PaymentCreateRecord): Promise<void>;
  updateCompensationStatus(
    compensationId: string,
    status: 'paid',
    updatedAt: Date
  ): Promise<void>;
}

export interface PaymentSimulationStore {
  runInTransaction<T>(
    work: (tx: PaymentSimulationTransaction) => Promise<T>
  ): Promise<T>;
}

export async function simulateCardPayment(
  deps: {
    store: PaymentSimulationStore;
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

    const simulationStatus = resolveSimulationOutcome(normalizedCardNumber);
    const paymentStatus = mapSimulationToPaymentStatus(simulationStatus);
    const providerReference = buildProviderReference({
      simulationStatus,
      cardNumber: normalizedCardNumber,
      now,
    });

    await tx.insertPayment({
      id: paymentId,
      compensationId: compensation.id,
      provider: 'card_simulator',
      providerReference,
      amount: compensation.totalAmount,
      currency: compensation.currency,
      status: paymentStatus,
      paidAt: paymentStatus === 'paid' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    let compensationStatus: 'pending' | 'paid' = 'pending';
    if (paymentStatus === 'paid') {
      await tx.updateCompensationStatus(compensation.id, 'paid', now);
      compensationStatus = 'paid';
    }

    return {
      paymentId,
      compensationId: compensation.id,
      provider: 'card_simulator' as const,
      providerReference,
      simulationStatus,
      paymentStatus,
      amount: compensation.totalAmount,
      currency: compensation.currency,
      installments: input.installments,
      processedAt: now,
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

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function resolveSimulationOutcome(cardNumber: string): CardSimulationOutcome {
  switch (cardNumber) {
    case '4111111111111111':
      return 'authorized';
    case '4000000000000002':
      return 'declined';
    case '4000000000000101':
      return 'in_review';
    case '4000000000009995':
      return 'timeout';
    case '4000000000009987':
      return 'canceled';
    default:
      return 'authorized';
  }
}

function mapSimulationToPaymentStatus(
  outcome: CardSimulationOutcome
): 'pending' | 'paid' | 'failed' {
  switch (outcome) {
    case 'authorized':
      return 'paid';
    case 'declined':
    case 'canceled':
      return 'failed';
    case 'in_review':
    case 'timeout':
      return 'pending';
  }
}

function buildProviderReference(input: {
  simulationStatus: CardSimulationOutcome;
  cardNumber: string;
  now: Date;
}): string {
  const suffix = input.cardNumber.slice(-4);
  return `sim_${input.simulationStatus}_${suffix}_${input.now.getTime()}`;
}
