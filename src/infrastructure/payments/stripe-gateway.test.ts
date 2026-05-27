import { describe, expect, test, mock } from "bun:test";
import { StripePaymentGatewayAdapter } from "./stripe-gateway";

function createClock() {
  return { now: () => new Date("2026-05-04T12:00:00Z") };
}

function createMockStripe(overrides: Partial<Record<string, any>> = {}) {
  const defaultEvent = {
    id: "evt_test_123",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_test_123", status: "succeeded" } },
  };
  const constructEvent =
    overrides.webhooks?.constructEvent ?? mock().mockReturnValue(defaultEvent);
  const constructEventAsync =
    overrides.webhooks?.constructEventAsync ??
    mock().mockImplementation(async (...args: any[]) =>
      constructEvent(...args),
    );

  const webhooks = {
    constructEvent,
    constructEventAsync,
  };

  return {
    paymentIntents: {
      create: mock().mockResolvedValue({
        id: "pi_test_123",
        status: "succeeded",
        client_secret: "pi_test_123_secret_secret",
        next_action: null,
      }),
      retrieve: mock().mockResolvedValue({
        id: "pi_test_123",
        status: "succeeded",
      }),
    },
    ...overrides,
    webhooks,
  } as any;
}

describe("StripePaymentGatewayAdapter", () => {
  describe("provider", () => {
    test("returns stripe", () => {
      const adapter = new StripePaymentGatewayAdapter({
        stripe: createMockStripe(),
        clock: createClock(),
        webhookSecret: "whsec_test",
      });
      expect(adapter.provider).toBe("stripe");
    });
  });

  describe("getChargeStatus", () => {
    test("retrieves PaymentIntent by provider reference and maps outcome", async () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.getChargeStatus({
        providerReference: "pi_test_123",
      });

      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
        "pi_test_123",
      );
      expect(result.provider).toBe("stripe");
      expect(result.outcome).toBe("authorized");
    });

    test("returns timeout for invalid provider reference", async () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.getChargeStatus({
        providerReference: "invalid_ref",
      });

      expect(result.provider).toBe("stripe");
      expect(result.outcome).toBe("timeout");
    });
  });

  describe("verifyWebhookSignature", () => {
    test("returns true for valid signature", async () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.verifyWebhookSignature({
        payload: '{"type":"payment_intent.succeeded"}',
        signature: "t=123,v1=abc",
      });

      expect(result).toBe(true);
    });

    test("returns false for null signature", async () => {
      const stripe = createMockStripe();
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.verifyWebhookSignature({
        payload: "{}",
        signature: null,
      });

      expect(result).toBe(false);
    });

    test("returns false when constructEvent throws", async () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockImplementation(() => {
            throw new Error("Invalid signature");
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.verifyWebhookSignature({
        payload: "{}",
        signature: "invalid",
      });

      expect(result).toBe(false);
    });
  });

  describe("createPaymentIntent", () => {
    test("creates card PaymentIntent with Connect routing", async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: "pi_connect_1",
            client_secret: "pi_connect_1_secret",
            status: "requires_payment_method",
            next_action: null,
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.createPaymentIntent({
        amount: 150.0,
        currency: "BRL",
        paymentMethod: "card",
        connectedAccountId: "acct_producer_1",
        applicationFeeAmount: 7.5,
        idempotencyKey: "comp_comp-1_pay_pay-1",
        metadata: { compensationId: "comp-1", paymentId: "pay-1" },
      });

      expect(result.clientSecret).toBe("pi_connect_1_secret");
      expect(result.paymentIntentId).toBe("pi_connect_1");
      expect(result.qrCode).toBeUndefined();

      const createCall = stripe.paymentIntents.create.mock.calls[0]?.[0];
      const createOptions = stripe.paymentIntents.create.mock.calls[0]?.[1];
      expect(createCall.payment_method_types).toEqual(["card"]);
      expect(createCall.application_fee_amount).toBeGreaterThan(0);
      expect(createCall.transfer_data.destination).toBe("acct_producer_1");
      expect(createOptions.idempotencyKey).toBe("comp_comp-1_pay_pay-1");
    });

    test("creates Pix PaymentIntent with QR code data", async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: "pi_pix_1",
            client_secret: null,
            status: "requires_payment_method",
            next_action: {
              type: "pix_display_qr_code",
              pix_display_qr_code: {
                image_url_png: "https://stripe.com/qr.png",
                data: "00020126360014BR.GOV.BCB.PIX...",
              },
            },
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.createPaymentIntent({
        amount: 200.0,
        currency: "BRL",
        paymentMethod: "pix",
        connectedAccountId: "acct_producer_2",
        applicationFeeAmount: 10.0,
        idempotencyKey: "comp_comp-2_pay_pay-2",
        metadata: { compensationId: "comp-2", paymentId: "pay-2" },
      });

      expect(result.clientSecret).toBeNull();
      expect(result.paymentIntentId).toBe("pi_pix_1");
      expect(result.qrCode).toBe("https://stripe.com/qr.png");
      expect(result.copyPasteCode).toBe("00020126360014BR.GOV.BCB.PIX...");

      const createCall = stripe.paymentIntents.create.mock.calls[0]?.[0];
      expect(createCall.payment_method_types).toEqual(["pix"]);
    });

    test("converts BRL amount to cents", async () => {
      const stripe = createMockStripe({
        paymentIntents: {
          create: mock().mockResolvedValue({
            id: "pi_amount_1",
            client_secret: "pi_secret",
            status: "requires_payment_method",
            next_action: null,
          }),
          retrieve: mock(),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      await adapter.createPaymentIntent({
        amount: 150.0,
        currency: "BRL",
        paymentMethod: "card",
        connectedAccountId: "acct_1",
        applicationFeeAmount: 7.5,
        idempotencyKey: "comp_comp-1_pay_pay-1",
        metadata: { compensationId: "comp-1", paymentId: "pay-1" },
      });

      const createCall = stripe.paymentIntents.create.mock.calls[0]?.[0];
      expect(createCall.amount).toBe(15000);
      expect(createCall.application_fee_amount).toBe(750);
    });
  });

  describe("parseWebhookEvent", () => {
    test("parses payment_intent.succeeded event", async () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockReturnValue({
            id: "evt_1",
            type: "payment_intent.succeeded",
            data: {
              object: { id: "pi_webhook_1", status: "succeeded" },
            },
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.parseWebhookEvent(
        '{"type":"payment_intent.succeeded"}',
        "t=123,v1=valid",
      );

      expect(result.type).toBe("payment_intent.succeeded");
      expect(result.eventId).toBe("evt_1");
      expect(result.paymentIntentId).toBe("pi_webhook_1");
      expect(result.outcome).toBe("authorized");
    });

    test("parses payment_intent.payment_failed event", async () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockReturnValue({
            id: "evt_2",
            type: "payment_intent.payment_failed",
            data: {
              object: { id: "pi_webhook_2", status: "requires_payment_method" },
            },
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.parseWebhookEvent(
        '{"type":"payment_intent.payment_failed"}',
        "t=123,v1=valid",
      );

      expect(result.type).toBe("payment_intent.payment_failed");
      expect(result.eventId).toBe("evt_2");
      expect(result.paymentIntentId).toBe("pi_webhook_2");
      expect(result.outcome).toBe("declined");
    });

    test("returns null for non-payment-intent events", async () => {
      const stripe = createMockStripe({
        webhooks: {
          constructEvent: mock().mockReturnValue({
            id: "evt_3",
            type: "account.updated",
            data: { object: { id: "acct_1" } },
          }),
        },
      });
      const adapter = new StripePaymentGatewayAdapter({
        stripe,
        clock: createClock(),
        webhookSecret: "whsec_test",
      });

      const result = await adapter.parseWebhookEvent(
        '{"type":"account.updated"}',
        "t=123,v1=valid",
      );

      expect(result.type).toBe("account.updated");
      expect(result.eventId).toBe("evt_3");
      expect(result.paymentIntentId).toBeNull();
      expect(result.outcome).toBeNull();
    });
  });
});
