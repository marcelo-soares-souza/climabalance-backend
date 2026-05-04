import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import type { PaymentGatewayAdapter } from './payment-gateway';
import type { PaymentStore } from './payment-store';
import type { StripePaymentGatewayAdapter } from '../../infrastructure/payments/stripe-gateway';

export type AreaOwnerLookup = {
  getOwnerUserId(areaId: string): Promise<string | null>;
};

export type StripeConnectLookup = {
  getByUserId(userId: string): Promise<{
    stripeAccountId: string;
    chargesEnabled: boolean;
  } | null>;
};

export type CreateStripePaymentIntentInput = {
  actorUserId: string;
  actorRoles: string[];
  compensationId: string;
  paymentMethod: 'card' | 'pix';
};

export type CreateStripePaymentIntentResult = {
  paymentId: string;
  compensationId: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  compensationStatus: 'pending' | 'paid' | 'canceled';
  amount: number;
  currency: string;
  processedAt: Date;
  // Card
  clientSecret?: string | null;
  // Pix
  qrCode?: string;
  copyPasteCode?: string;
  paymentIntentId: string;
};

export async function createStripePaymentIntent(
  deps: {
    store: PaymentStore;
    paymentGateway: PaymentGatewayAdapter;
    areaOwnerLookup: AreaOwnerLookup;
    stripeConnectLookup: StripeConnectLookup;
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
    platformFeePercent: number;
  },
  input: CreateStripePaymentIntentInput
): Promise<CreateStripePaymentIntentResult> {
  if (!['card', 'pix'].includes(input.paymentMethod)) {
    throw new ValidationError([
      { field: 'payment_method', message: 'invalid_payment_method' },
    ]);
  }

  if (!input.compensationId.trim()) {
    throw new ValidationError([
      { field: 'compensation_id', message: 'required' },
    ]);
  }

  const now = deps.clock.now();
  const paymentId = deps.idGenerator.generate();
  const stripeGateway = deps.paymentGateway as StripePaymentGatewayAdapter;

  if (deps.paymentGateway.provider !== 'stripe') {
    throw new ValidationError([
      { field: 'provider', message: 'stripe_not_available' },
    ]);
  }

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

    const ownerUserId = await deps.areaOwnerLookup.getOwnerUserId(
      compensation.areaId
    );
    if (!ownerUserId) {
      throw new NotFoundError('area.not_found');
    }

    const stripeAccount = await deps.stripeConnectLookup.getByUserId(
      ownerUserId
    );
    if (!stripeAccount || !stripeAccount.chargesEnabled) {
      throw new ValidationError([
        { field: 'compensation_id', message: 'producer_not_onboarded' },
      ]);
    }

    const applicationFeeAmount =
      (compensation.totalAmount * deps.platformFeePercent) / 100;

    const paymentIntent = await stripeGateway.createPaymentIntent({
      amount: compensation.totalAmount,
      currency: compensation.currency,
      paymentMethod: input.paymentMethod,
      connectedAccountId: stripeAccount.stripeAccountId,
      applicationFeeAmount,
      metadata: {
        compensationId: compensation.id,
        paymentId,
      },
    });

    await tx.insertPayment({
      id: paymentId,
      compensationId: compensation.id,
      provider: 'stripe',
      providerReference: `pi_${paymentIntent.paymentIntentId}`,
      amount: compensation.totalAmount,
      currency: compensation.currency,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      paymentMethod: input.paymentMethod,
      stripePaymentIntentId: paymentIntent.paymentIntentId,
    });

    return {
      paymentId,
      compensationId: compensation.id,
      paymentStatus: 'pending' as const,
      compensationStatus: compensation.status,
      amount: compensation.totalAmount,
      currency: compensation.currency,
      processedAt: now,
      clientSecret: paymentIntent.clientSecret,
      qrCode: paymentIntent.qrCode,
      copyPasteCode: paymentIntent.copyPasteCode,
      paymentIntentId: paymentIntent.paymentIntentId,
    };
  });

  await deps.auditLog.log({
    actorUserId: input.actorUserId,
    action: 'payment.intent_created',
    entityType: 'payment',
    entityId: result.paymentId,
    metadata: {
      compensation_id: result.compensationId,
      payment_method: input.paymentMethod,
      stripe_payment_intent_id: result.paymentIntentId,
      amount: result.amount,
      currency: result.currency,
    },
  });

  return result;
}
