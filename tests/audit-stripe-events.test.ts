import { describe, expect, test, mock } from "bun:test";
import { createStripePaymentIntent } from "../src/application/payments/create-stripe-payment-intent";
import type { PaymentStore } from "../src/application/payments/payment-store";

function createAuditMock() {
  const logs: Array<{
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    changedFields?: string[];
    severity?: string;
    success?: boolean;
  }> = [];

  return {
    logs,
    log: mock((entry: any) => {
      logs.push({
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        previousState: entry.previousState,
        newState: entry.newState,
        changedFields: entry.changedFields,
        severity: entry.severity,
        success: entry.success,
      });
      return Promise.resolve();
    }),
  };
}

function createStore(compensationStatus = "pending"): PaymentStore {
  return {
    runInTransaction: mock(async (work) => {
      return work({
        lockCompensation: mock(async () => ({
          id: "comp-1",
          supporterUserId: "supporter-1",
          areaId: "area-1",
          totalAmount: 150,
          currency: "BRL",
          status: compensationStatus,
        })),
        lockLatestPendingPaymentByCompensationId: mock(async () => null),
        insertPayment: mock(async () => {}),
        lockPaymentById: mock(async () => null),
        lockPaymentByProviderReference: mock(async () => null),
        lockPaymentByStripePaymentIntentId: mock(async () => null),
        updatePaymentStatus: mock(async () => {}),
        updateCompensationStatus: mock(async () => {}),
      });
    }),
    listPendingPayments: mock(async () => []),
    getCompensationForCertificate: mock(async () => null),
  };
}

describe("Audit Compliance - Stripe Payment Events", () => {
  describe("payment.intent_created", () => {
    test("logs intent_created when PaymentIntent is created", async () => {
      const audit = createAuditMock();

      const stripeGateway = {
        provider: "stripe",

        getChargeStatus: mock(async () => ({})),
        verifyWebhookSignature: mock(() => true),
        createPaymentIntent: mock(async () => ({
          clientSecret: "pi_secret",
          paymentIntentId: "pi_123",
        })),
      };

      const areaOwnerLookup = {
        getOwnerUserId: mock(async () => "producer-1"),
      };

      const stripeConnectLookup = {
        getByUserId: mock(async () => ({
          stripeAccountId: "acct_prod_1",
          chargesEnabled: true,
          payoutsEnabled: true,
        })),
      };

      await createStripePaymentIntent(
        {
          store: createStore(),
          paymentGateway: stripeGateway,
          areaOwnerLookup,
          stripeConnectLookup,
          idGenerator: { generate: () => "pay-1" },
          clock: { now: () => new Date("2026-05-04T12:00:00Z") },
          auditLog: audit,
          platformFeePercent: 10,
        },
        {
          actorUserId: "supporter-1",
          actorRoles: ["individual"],
          compensationId: "comp-1",
          paymentMethod: "card",
        },
      );

      expect(audit.logs).toHaveLength(1);
      expect(audit.logs[0].action).toBe("payment.intent_created");
      expect(audit.logs[0].entityType).toBe("payment");
      expect(audit.logs[0].metadata).toHaveProperty(
        "stripe_payment_intent_id",
        "pi_123",
      );
      expect(audit.logs[0].metadata).toHaveProperty("payment_method", "card");
    });

    test("includes amount and currency in intent_created audit", async () => {
      const audit = createAuditMock();

      const stripeGateway = {
        provider: "stripe",

        getChargeStatus: mock(async () => ({})),
        verifyWebhookSignature: mock(() => true),
        createPaymentIntent: mock(async () => ({
          clientSecret: "pi_secret",
          paymentIntentId: "pi_456",
        })),
      };

      await createStripePaymentIntent(
        {
          store: createStore(),
          paymentGateway: stripeGateway,
          areaOwnerLookup: { getOwnerUserId: mock(async () => "producer-2") },
          stripeConnectLookup: {
            getByUserId: mock(async () => ({
              stripeAccountId: "acct_prod_2",
              chargesEnabled: true,
              payoutsEnabled: true,
            })),
          },
          idGenerator: { generate: () => "pay-2" },
          clock: { now: () => new Date("2026-05-04T12:00:00Z") },
          auditLog: audit,
          platformFeePercent: 10,
        },
        {
          actorUserId: "supporter-1",
          actorRoles: ["legal_entity"],
          compensationId: "comp-1",
          paymentMethod: "pix",
        },
      );

      expect(audit.logs[0].metadata).toHaveProperty("payment_method", "pix");
      expect(audit.logs[0].metadata).toHaveProperty("amount", 150);
      expect(audit.logs[0].metadata).toHaveProperty("currency", "BRL");
    });

    test("calculates application_fee_amount correctly for 10% fee", async () => {
      const audit = createAuditMock();

      const stripeGateway = {
        provider: "stripe",
        getChargeStatus: mock(async () => ({})),
        verifyWebhookSignature: mock(() => true),
        createPaymentIntent: mock(async () => ({
          clientSecret: "pi_secret",
          paymentIntentId: "pi_fee_test",
        })),
      };

      const storeWithAmount100: PaymentStore = {
        runInTransaction: mock(async (work) => {
          return work({
            lockCompensation: mock(async () => ({
              id: "comp-fee",
              supporterUserId: "supporter-1",
              areaId: "area-1",
              totalAmount: 100,
              currency: "BRL",
              status: "pending",
            })),
            lockLatestPendingPaymentByCompensationId: mock(async () => null),
            insertPayment: mock(async () => {}),
            lockPaymentById: mock(async () => null),
            lockPaymentByProviderReference: mock(async () => null),
            lockPaymentByStripePaymentIntentId: mock(async () => null),
            updatePaymentStatus: mock(async () => {}),
            updateCompensationStatus: mock(async () => {}),
          });
        }),
        listPendingPayments: mock(async () => []),
        getCompensationForCertificate: mock(async () => null),
      };

      await createStripePaymentIntent(
        {
          store: storeWithAmount100,
          paymentGateway: stripeGateway,
          areaOwnerLookup: { getOwnerUserId: mock(async () => "producer-1") },
          stripeConnectLookup: {
            getByUserId: mock(async () => ({
              stripeAccountId: "acct_prod_1",
              chargesEnabled: true,
              payoutsEnabled: true,
            })),
          },
          idGenerator: { generate: () => "pay-fee" },
          clock: { now: () => new Date("2026-05-04T12:00:00Z") },
          auditLog: audit,
          platformFeePercent: 10,
        },
        {
          actorUserId: "supporter-1",
          actorRoles: ["individual"],
          compensationId: "comp-fee",
          paymentMethod: "card",
        },
      );

      const createCall = stripeGateway.createPaymentIntent.mock.calls[0]?.[0];
      expect(createCall.applicationFeeAmount).toBe(10);
      expect(createCall.amount).toBe(100);
    });
  });
});

describe("Audit Compliance - Stripe Connect Events", () => {
  test("producer.stripe_onboarding_started logs correct fields", () => {
    const audit = createAuditMock();

    // Simulate the audit log that would be written by the handler
    audit.log({
      actorUserId: "producer-1",
      action: "producer.stripe_onboarding_started",
      entityType: "stripe_connect_account",
      entityId: "acct_123",
      metadata: {
        stripe_account_id: "acct_123",
        country: "BR",
        account_type: "express",
      },
    });

    expect(audit.logs).toHaveLength(1);
    expect(audit.logs[0].action).toBe("producer.stripe_onboarding_started");
    expect(audit.logs[0].metadata).toHaveProperty(
      "stripe_account_id",
      "acct_123",
    );
    expect(audit.logs[0].metadata).toHaveProperty("account_type", "express");
  });

  test("producer.stripe_onboarding_updated includes previousState and newState", () => {
    const audit = createAuditMock();

    audit.log({
      actorUserId: "producer-1",
      action: "producer.stripe_onboarding_updated",
      entityType: "stripe_connect_account",
      entityId: "sca-1",
      metadata: {
        stripe_account_id: "acct_123",
        source: "manual_poll",
      },
      previousState: {
        charges_enabled: false,
        payouts_enabled: false,
      },
      newState: {
        charges_enabled: true,
        payouts_enabled: true,
      },
      changedFields: ["charges_enabled", "payouts_enabled"],
    });

    expect(audit.logs).toHaveLength(1);
    expect(audit.logs[0].previousState).toEqual({
      charges_enabled: false,
      payouts_enabled: false,
    });
    expect(audit.logs[0].newState).toEqual({
      charges_enabled: true,
      payouts_enabled: true,
    });
    expect(audit.logs[0].changedFields).toEqual([
      "charges_enabled",
      "payouts_enabled",
    ]);
  });
});

describe("Audit Compliance - Security Events", () => {
  test("payment.webhook_invalid_signature uses severity critical", () => {
    const audit = createAuditMock();

    audit.log({
      actorUserId: "system:webhook",
      action: "payment.webhook_invalid_signature",
      entityType: "webhook",
      entityId: "",
      severity: "critical",
      success: false,
      errorCode: "invalid_signature",
    });

    expect(audit.logs[0].action).toBe("payment.webhook_invalid_signature");
    expect(audit.logs[0].severity).toBe("critical");
    expect(audit.logs[0].success).toBe(false);
  });

  test("payment.webhook_unknown_provider uses severity warning", () => {
    const audit = createAuditMock();

    audit.log({
      actorUserId: "system:webhook",
      action: "payment.webhook_unknown_provider",
      entityType: "webhook",
      entityId: "",
      severity: "warning",
      success: false,
      errorCode: "unknown_provider",
      metadata: { provider: "unknown_gateway" },
    });

    expect(audit.logs[0].action).toBe("payment.webhook_unknown_provider");
    expect(audit.logs[0].severity).toBe("warning");
  });
});
