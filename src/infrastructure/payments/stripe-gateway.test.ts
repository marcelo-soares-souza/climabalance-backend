import { describe, expect, test, mock } from 'bun:test';
import { StripePaymentGatewayAdapter } from './stripe-gateway';
import type { CreatePaymentChargeInput } from '../../application/payments/payment-gateway';

function createClock() {
  return { now: () => new Date('2026-05-04T12:00:00Z') };
}

function createMockStripe(overrides: Partial<Record<string, any>> = {}) {
  return {
    paymentMethods: {
      create: mock().mockResolvedValue({
        id: 'pm_test_123',
        type: 'card',
      }),
    },
    paymentIntents: {
      create: mock().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
        client_secret: 'pi_test_123_secret_secret',
        next_action: null,
      }),
      retrieve: mock().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
    },
    webhooks: {
      constructEvent: mock().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_123', status: 'succeeded' } },
      }),
    },
    ...overrides,
  } as any;
}

describe('StripePaymentGatewayAdapter', () => {
  describe('provider', () => {
    test('returns stripe', () => {
      const adapter = new StripePaymentGatewayAdapter({
        stripe: createMockStripe(),
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });
      expect(adapter.provider).toBe('stripe');
    });
  });

  describe('createCharge', () => {
    test('creates a PaymentMethod from card details and confirms a PaymentIntent', async () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const input: CreatePaymentChargeInput = {
        paymentId: 'pay-1',
        compensationId: 'comp-1',
        amount: 150.0,
        currency: 'BRL',
        cardNumber: '4242424242424242',
        cardholderName: 'Test User',
        expirationMonth: 12,
        expirationYear: 2027,
        cvv: '123',
        installments: 1,
      };

      const result = await adapter.createCharge(input);

      expect(stripe.paymentMethods.create).toHaveBeenCalledTimes(1);
      expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('stripe');
      expect(result.providerReference).toBe('pi_pi_test_123');
      expect(result.outcome).toBe('authorized');
    });

    test('maps requires_payment_method to declined', async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: 'pi_declined_1',
            status: 'requires_payment_method',
            client_secret: null,
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const input: CreatePaymentChargeInput = {
        paymentId: 'pay-2',
        compensationId: 'comp-2',
        amount: 50.0,
        currency: 'USD',
        cardNumber: '4000000000000002',
        cardholderName: 'Declined User',
        expirationMonth: 1,
        expirationYear: 2026,
        cvv: '456',
        installments: 1,
      };

      const result = await adapter.createCharge(input);
      expect(result.outcome).toBe('declined');
    });

    test('maps processing to in_review', async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: 'pi_processing_1',
            status: 'processing',
            client_secret: 'pi_secret',
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const input: CreatePaymentChargeInput = {
        paymentId: 'pay-3',
        compensationId: 'comp-3',
        amount: 100.0,
        currency: 'BRL',
        cardNumber: '4000000000000101',
        cardholderName: 'Review User',
        expirationMonth: 6,
        expirationYear: 2028,
        cvv: '789',
        installments: 2,
      };

      const result = await adapter.createCharge(input);
      expect(result.outcome).toBe('in_review');
    });

    test('maps canceled to canceled', async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: 'pi_canceled_1',
            status: 'canceled',
            client_secret: null,
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const input: CreatePaymentChargeInput = {
        paymentId: 'pay-4',
        compensationId: 'comp-4',
        amount: 75.0,
        currency: 'BRL',
        cardNumber: '4000000000009987',
        cardholderName: 'Cancel User',
        expirationMonth: 3,
        expirationYear: 2026,
        cvv: '321',
        installments: 1,
      };

      const result = await adapter.createCharge(input);
      expect(result.outcome).toBe('canceled');
    });
  });

  describe('getChargeStatus', () => {
    test('retrieves PaymentIntent by provider reference and maps outcome', async () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = await adapter.getChargeStatus({
        providerReference: 'pi_pi_test_123',
      });

      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test_123');
      expect(result.provider).toBe('stripe');
      expect(result.outcome).toBe('authorized');
    });

    test('returns timeout for invalid provider reference', async () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = await adapter.getChargeStatus({
        providerReference: 'invalid_ref',
      });

      expect(result.provider).toBe('stripe');
      expect(result.outcome).toBe('timeout');
    });
  });

  describe('verifyWebhookSignature', () => {
    test('returns true for valid signature', () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = adapter.verifyWebhookSignature({
        payload: '{"type":"payment_intent.succeeded"}',
        signature: 't=123,v1=abc',
      });

      expect(result).toBe(true);
    });

    test('returns false for null signature', () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = adapter.verifyWebhookSignature({
        payload: '{}',
        signature: null,
      });

      expect(result).toBe(false);
    });

    test('returns false when constructEvent throws', () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockImplementation(() => {
            throw new Error('Invalid signature');
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = adapter.verifyWebhookSignature({
        payload: '{}',
        signature: 'invalid',
      });

      expect(result).toBe(false);
    });
  });

  describe('createPaymentIntent', () => {
    test('creates card PaymentIntent with Connect routing', async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: 'pi_connect_1',
            client_secret: 'pi_connect_1_secret',
            status: 'requires_payment_method',
            next_action: null,
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = await adapter.createPaymentIntent({
        amount: 150.0,
        currency: 'BRL',
        paymentMethod: 'card',
        connectedAccountId: 'acct_producer_1',
        applicationFeeAmount: 7.5,
        metadata: { compensationId: 'comp-1', paymentId: 'pay-1' },
      });

      expect(result.clientSecret).toBe('pi_connect_1_secret');
      expect(result.paymentIntentId).toBe('pi_connect_1');
      expect(result.qrCode).toBeUndefined();

      const createCall = stripe.paymentIntents.create.mock.calls[0]?.[0];
      expect(createCall.payment_method_types).toEqual(['card']);
      expect(createCall.application_fee_amount).toBeGreaterThan(0);
      expect(createCall.transfer_data.destination).toBe('acct_producer_1');
    });

    test('creates Pix PaymentIntent with QR code data', async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: 'pi_pix_1',
            client_secret: null,
            status: 'requires_payment_method',
            next_action: {
              type: 'pix_display_qr_code',
              pix_display_qr_code: {
                image_url_png: 'https://stripe.com/qr.png',
                data: '00020126360014BR.GOV.BCB.PIX...',
              },
            },
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = await adapter.createPaymentIntent({
        amount: 200.0,
        currency: 'BRL',
        paymentMethod: 'pix',
        connectedAccountId: 'acct_producer_2',
        applicationFeeAmount: 10.0,
        metadata: { compensationId: 'comp-2', paymentId: 'pay-2' },
      });

      expect(result.clientSecret).toBeNull();
      expect(result.paymentIntentId).toBe('pi_pix_1');
      expect(result.qrCode).toBe('https://stripe.com/qr.png');
      expect(result.copyPasteCode).toBe('00020126360014BR.GOV.BCB.PIX...');

      const createCall = stripe.paymentIntents.create.mock.calls[0]?.[0];
      expect(createCall.payment_method_types).toEqual(['pix']);
    });

    test('converts BRL amount to cents', async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: 'pi_amount_1',
            client_secret: 'pi_secret',
            status: 'requires_payment_method',
            next_action: null,
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      await adapter.createPaymentIntent({
        amount: 150.0,
        currency: 'BRL',
        paymentMethod: 'card',
        connectedAccountId: 'acct_1',
        applicationFeeAmount: 7.5,
        metadata: { compensationId: 'comp-1', paymentId: 'pay-1' },
      });

      const createCall = stripe.paymentIntents.create.mock.calls[0]?.[0];
      expect(createCall.amount).toBe(15000);
      expect(createCall.application_fee_amount).toBe(750);
    });
  });

  describe('parseWebhookEvent', () => {
    test('parses payment_intent.succeeded event', () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockReturnValue({
            type: 'payment_intent.succeeded',
            data: {
              object: { id: 'pi_webhook_1', status: 'succeeded' },
            },
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = adapter.parseWebhookEvent(
        '{"type":"payment_intent.succeeded"}',
        't=123,v1=valid'
      );

      expect(result.type).toBe('payment_intent.succeeded');
      expect(result.paymentIntentId).toBe('pi_webhook_1');
      expect(result.outcome).toBe('authorized');
    });

    test('parses payment_intent.payment_failed event', () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockReturnValue({
            type: 'payment_intent.payment_failed',
            data: {
              object: { id: 'pi_webhook_2', status: 'requires_payment_method' },
            },
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = adapter.parseWebhookEvent(
        '{"type":"payment_intent.payment_failed"}',
        't=123,v1=valid'
      );

      expect(result.type).toBe('payment_intent.payment_failed');
      expect(result.paymentIntentId).toBe('pi_webhook_2');
      expect(result.outcome).toBe('declined');
    });

    test('returns null for non-payment-intent events', () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockReturnValue({
            type: 'account.updated',
            data: { object: { id: 'acct_1' } },
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: 'whsec_test',
      });

      const result = adapter.parseWebhookEvent(
        '{"type":"account.updated"}',
        't=123,v1=valid'
      );

      expect(result.type).toBe('account.updated');
      expect(result.paymentIntentId).toBeNull();
      expect(result.outcome).toBeNull();
    });
  });
});
