import Stripe from 'stripe';
import type {
  CreatePaymentChargeInput,
  PaymentGatewayAdapter,
  PaymentGatewayChargeResult,
  PaymentGatewayOutcome,
  PaymentGatewayStatusResult,
} from '../../application/payments/payment-gateway';

const provider = 'stripe';

const providerReferencePrefix = 'pi_';

export type StripePaymentIntentCreateInput = {
  amount: number;
  currency: string;
  paymentMethod: 'card' | 'pix';
  connectedAccountId: string;
  applicationFeeAmount: number;
  idempotencyKey: string;
  metadata: { compensationId: string; paymentId: string };
};

export type StripePaymentIntentCreateResult = {
  clientSecret: string | null;
  paymentIntentId: string;
  qrCode?: string;
  copyPasteCode?: string;
};

export class StripePaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly provider = provider;

  constructor(
    private readonly deps: {
      stripe: Stripe;
      clock: { now(): Date };
      webhookSecret: string;
    }
  ) {}

  async createCharge(
    input: CreatePaymentChargeInput
  ): Promise<PaymentGatewayChargeResult> {
    const now = this.deps.clock.now();

    const paymentMethod = await this.deps.stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: input.cardNumber,
        exp_month: input.expirationMonth,
        exp_year: input.expirationYear,
        cvc: input.cvv,
      },
      billing_details: {
        name: input.cardholderName,
      },
    });

    const paymentIntent = await this.deps.stripe.paymentIntents.create({
      amount: toStripeAmount(input.amount, input.currency),
      currency: input.currency.toLowerCase(),
      payment_method: paymentMethod.id,
      confirm: true,
      metadata: {
        compensation_id: input.compensationId,
        payment_id: input.paymentId,
      },
    });

    return {
      provider,
      providerReference: `${providerReferencePrefix}${paymentIntent.id}`,
      outcome: mapStripeStatusToOutcome(paymentIntent.status),
      processedAt: now,
    };
  }

  async getChargeStatus(input: {
    providerReference: string;
  }): Promise<PaymentGatewayStatusResult> {
    const now = this.deps.clock.now();
    const paymentIntentId = extractPaymentIntentId(input.providerReference);

    if (!paymentIntentId) {
      return {
        provider,
        providerReference: input.providerReference,
        outcome: 'timeout',
        processedAt: now,
      };
    }

    const paymentIntent =
      await this.deps.stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      provider,
      providerReference: input.providerReference,
      outcome: mapStripeStatusToOutcome(paymentIntent.status),
      processedAt: now,
    };
  }

  verifyWebhookSignature(input: {
    payload: string;
    signature: string | null;
  }): Promise<boolean> {
    if (!input.signature) {
      return Promise.resolve(false);
    }

    try {
      return this.deps.stripe.webhooks
        .constructEventAsync(
        input.payload,
        input.signature,
        this.deps.webhookSecret
      )
        .then(() => true)
        .catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  /**
   * Creates a Stripe PaymentIntent for card or Pix with Connect routing.
   * Not part of PaymentGatewayAdapter — called directly by the new use case.
   */
  async createPaymentIntent(
    input: StripePaymentIntentCreateInput
  ): Promise<StripePaymentIntentCreateResult> {
    const paymentMethodTypes: string[] =
      input.paymentMethod === 'card' ? ['card'] : ['pix'];

    const paymentIntent = await this.deps.stripe.paymentIntents.create(
      {
        amount: toStripeAmount(input.amount, input.currency),
        currency: input.currency.toLowerCase(),
        payment_method_types: paymentMethodTypes,
        application_fee_amount: toStripeAmount(
          input.applicationFeeAmount,
          input.currency
        ),
        transfer_data: {
          destination: input.connectedAccountId,
        },
        metadata: {
          compensation_id: input.metadata.compensationId,
          payment_id: input.metadata.paymentId,
        },
      },
      {
        idempotencyKey: input.idempotencyKey,
      }
    );

    const result: StripePaymentIntentCreateResult = {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };

    if (
      input.paymentMethod === 'pix' &&
      paymentIntent.next_action?.type === 'pix_display_qr_code'
    ) {
      const pixData = paymentIntent.next_action.pix_display_qr_code;
      result.qrCode = (pixData as any)?.image_url_png ?? undefined;
      result.copyPasteCode = pixData?.data ?? undefined;
    }

    return result;
  }

  /**
   * Parses a Stripe webhook event and extracts the PaymentIntent-based outcome.
   * Returns null if the event type is not a payment intent event.
   */
  async parseWebhookEvent(rawPayload: string, signature: string): Promise<{
    eventId: string;
    type: string;
    paymentIntentId: string | null;
    outcome: PaymentGatewayOutcome | null;
  }> {
    const event = await this.deps.stripe.webhooks.constructEventAsync(
      rawPayload,
      signature,
      this.deps.webhookSecret
    );

    if (
      event.type === 'payment_intent.succeeded' ||
      event.type === 'payment_intent.payment_failed'
    ) {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      return {
        eventId: event.id,
        type: event.type,
        paymentIntentId: paymentIntent.id,
        outcome: mapStripeStatusToOutcome(paymentIntent.status),
      };
    }

    return {
      eventId: event.id,
      type: event.type,
      paymentIntentId: null,
      outcome: null,
    };
  }
}

function mapStripeStatusToOutcome(
  status: Stripe.PaymentIntent.Status
): PaymentGatewayOutcome {
  switch (status) {
    case 'succeeded':
      return 'authorized';
    case 'requires_payment_method':
    case 'requires_confirmation':
      return 'declined';
    case 'processing':
    case 'requires_action':
    case 'requires_capture':
      return 'in_review';
    case 'canceled':
      return 'canceled';
    default:
      return 'timeout';
  }
}

function extractPaymentIntentId(
  providerReference: string
): string | null {
  if (providerReference.startsWith(providerReferencePrefix)) {
    return providerReference.slice(providerReferencePrefix.length);
  }
  return null;
}

/**
 * Stripe expects amounts in the smallest currency unit (cents).
 * Currencies with zero decimal places (e.g. JPY) are not supported yet.
 */
function toStripeAmount(amount: number, currency: string): number {
  const zeroDecimalCurrencies = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf',
    'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd',
    'vuv', 'xaf', 'xof', 'xpf',
  ]);

  if (zeroDecimalCurrencies.has(currency.toLowerCase())) {
    return Math.round(amount);
  }

  return Math.round(amount * 100);
}
