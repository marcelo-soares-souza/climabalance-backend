import { describe, expect, test } from "bun:test";
import { getPaymentStatus } from "../src/application/payments/get-payment-status";
import type {
  CompensationCertificateSnapshot,
  LockedPaymentRecord,
  PaymentCompensationSnapshot,
  PaymentCreateRecord,
  PaymentStatus,
  PaymentStore,
  PaymentTransaction,
  PendingPaymentRecord,
} from "../src/application/payments/payment-store";
import type {
  PaymentGatewayAdapter,
  PaymentGatewayStatusResult,
} from "../src/application/payments/payment-gateway";

class InMemoryPaymentStore implements PaymentStore {
  constructor(
    private readonly payment: LockedPaymentRecord,
    private readonly compensation: PaymentCompensationSnapshot,
  ) {}

  updatedPaymentStatus: PaymentStatus | null = null;
  updatedCompensationStatus:
    | "pending"
    | "paid"
    | "canceled"
    | "refunded"
    | null = null;

  async runInTransaction<T>(
    work: (tx: PaymentTransaction) => Promise<T>,
  ): Promise<T> {
    const tx: PaymentTransaction = {
      lockCompensation: async () => ({ ...this.compensation }),
      lockLatestPendingPaymentByCompensationId: async () => null,
      insertPayment: async (_record: PaymentCreateRecord) => {},
      lockPaymentById: async () => ({ ...this.payment }),
      lockPaymentByProviderReference: async () => ({ ...this.payment }),
      lockPaymentByStripePaymentIntentId: async () => ({ ...this.payment }),
      updatePaymentStatus: async (input) => {
        this.updatedPaymentStatus = input.status;
      },
      updateCompensationStatus: async (input) => {
        this.updatedCompensationStatus = input.status;
      },
    };

    return work(tx);
  }

  async listPendingPayments(_limit: number): Promise<PendingPaymentRecord[]> {
    return [];
  }

  async getCompensationForCertificate(
    _compensationId: string,
  ): Promise<CompensationCertificateSnapshot | null> {
    return null;
  }
}

function createGateway(
  outcome: PaymentGatewayStatusResult["outcome"],
): PaymentGatewayAdapter {
  return {
    provider: "stripe",
    async getChargeStatus() {
      return {
        provider: "stripe",
        providerReference: "pi_test_123",
        outcome,
        processedAt: new Date("2026-05-27T12:00:00Z"),
      };
    },
    async verifyWebhookSignature() {
      return true;
    },
  };
}

describe("getPaymentStatus", () => {
  test("keeps refunded payments as refunded even if the gateway reports paid", async () => {
    const store = new InMemoryPaymentStore(
      {
        id: "pay-1",
        compensationId: "comp-1",
        supporterUserId: "supporter-1",
        provider: "stripe",
        providerReference: "pi_test_123",
        amount: 100,
        currency: "USD",
        paymentStatus: "refunded",
        compensationStatus: "refunded",
      },
      {
        id: "comp-1",
        supporterUserId: "supporter-1",
        areaId: "area-1",
        totalAmount: 100,
        currency: "USD",
        status: "refunded",
      },
    );

    const auditLogs: Array<Record<string, unknown>> = [];
    const result = await getPaymentStatus(
      {
        store,
        paymentGateway: createGateway("authorized"),
        clock: { now: () => new Date("2026-05-27T12:00:01Z") },
        auditLog: {
          async log(entry) {
            auditLogs.push(entry);
          },
        },
      },
      {
        paymentId: "pay-1",
        actorUserId: "supporter-1",
        actorRoles: ["individual"],
      },
    );

    expect(result.paymentStatus).toBe("refunded");
    expect(result.compensationStatus).toBe("refunded");
    expect(store.updatedPaymentStatus).toBeNull();
    expect(store.updatedCompensationStatus).toBeNull();
    expect(auditLogs).toHaveLength(0);
  });

  test("persists paid status when polling observes a successful payment", async () => {
    const store = new InMemoryPaymentStore(
      {
        id: "pay-2",
        compensationId: "comp-2",
        supporterUserId: "supporter-2",
        provider: "stripe",
        providerReference: "pi_test_456",
        amount: 120,
        currency: "BRL",
        paymentStatus: "pending",
        compensationStatus: "pending",
      },
      {
        id: "comp-2",
        supporterUserId: "supporter-2",
        areaId: "area-2",
        totalAmount: 120,
        currency: "BRL",
        status: "pending",
      },
    );

    const auditLogs: Array<Record<string, unknown>> = [];
    const result = await getPaymentStatus(
      {
        store,
        paymentGateway: createGateway("authorized"),
        clock: { now: () => new Date("2026-05-27T12:00:01Z") },
        auditLog: {
          async log(entry) {
            auditLogs.push(entry);
          },
        },
      },
      {
        paymentId: "pay-2",
        actorUserId: "supporter-2",
        actorRoles: ["individual"],
      },
    );

    expect(result.paymentStatus).toBe("paid");
    expect(result.compensationStatus).toBe("paid");
    expect(store.updatedPaymentStatus).toBe("paid");
    expect(store.updatedCompensationStatus).toBe("paid");
    expect(auditLogs).toHaveLength(1);
  });
});
