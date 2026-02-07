import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CreatePaymentChargeInput,
  PaymentGatewayAdapter,
  PaymentGatewayChargeResult,
  PaymentGatewayOutcome,
  PaymentGatewayStatusResult,
} from '../../application/payments/payment-gateway';

const provider = 'card_simulator';

const providerReferencePattern =
  /^sim_(authorized|declined|in_review|timeout|canceled)_[0-9]{4}_[0-9]+$/;

export class CardSimulatorPaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly provider = provider;

  constructor(
    private readonly deps: {
      clock: { now(): Date };
      webhookSecret: string;
    }
  ) {}

  async createCharge(
    input: CreatePaymentChargeInput
  ): Promise<PaymentGatewayChargeResult> {
    const now = this.deps.clock.now();
    const outcome = resolveSimulationOutcome(input.cardNumber);
    const suffix = input.cardNumber.slice(-4).padStart(4, '0');

    const providerReference = `sim_${outcome}_${suffix}_${now.getTime()}`;

    return {
      provider,
      providerReference,
      outcome,
      processedAt: now,
    };
  }

  async getChargeStatus(input: {
    providerReference: string;
  }): Promise<PaymentGatewayStatusResult> {
    if (!providerReferencePattern.test(input.providerReference)) {
      return {
        provider,
        providerReference: input.providerReference,
        outcome: 'timeout',
        processedAt: this.deps.clock.now(),
      };
    }

    const outcomeMatch = input.providerReference.match(
      /^sim_(authorized|declined|in_review|timeout|canceled)_/
    );

    const outcome =
      (outcomeMatch?.[1] as PaymentGatewayOutcome | undefined) ?? 'timeout';

    return {
      provider,
      providerReference: input.providerReference,
      outcome,
      processedAt: this.deps.clock.now(),
    };
  }

  verifyWebhookSignature(input: {
    payload: string;
    signature: string | null;
  }): boolean {
    if (!input.signature) {
      return false;
    }

    const normalizedSignature = input.signature.startsWith('sha256=')
      ? input.signature.slice('sha256='.length)
      : input.signature;

    const expected = buildCardSimulatorWebhookSignature(
      input.payload,
      this.deps.webhookSecret
    );

    const receivedBytes = Buffer.from(normalizedSignature, 'hex');
    const expectedBytes = Buffer.from(expected, 'hex');

    if (receivedBytes.length !== expectedBytes.length) {
      return false;
    }

    return timingSafeEqual(receivedBytes, expectedBytes);
  }
}

export function buildCardSimulatorWebhookSignature(
  payload: string,
  secret: string
): string {
  return createHmac('sha256', secret).update(payload, 'utf-8').digest('hex');
}

function resolveSimulationOutcome(cardNumber: string): PaymentGatewayOutcome {
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
