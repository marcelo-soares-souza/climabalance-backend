import { describe, expect, test } from "bun:test";
import { createPaymentHandlers } from "../src/infrastructure/http/payment-handlers";
import type { HttpContext } from "../src/shared/http/router";
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
  CreatePaymentChargeInput,
  PaymentGatewayAdapter,
  PaymentGatewayOutcome,
  PaymentGatewayChargeResult,
  PaymentGatewayStatusResult,
} from "../src/application/payments/payment-gateway";
import type {
  CompensationCertificateLookup,
  CompensationCertificateRecord,
  CertificateFileRecord,
  CompensationCertificateListItem,
} from "../src/domain/compensations/repositories/compensation-certificate-repository";

class InMemoryPaymentStore implements PaymentStore {
  private readonly compensations = new Map<
    string,
    PaymentCompensationSnapshot
  >();
  private readonly payments = new Map<
    string,
    {
      id: string;
      compensationId: string;
      provider: string;
      providerReference: string;
      amount: number;
      currency: string;
      status: PaymentStatus;
      paidAt?: Date;
    }
  >();

  constructor(items: PaymentCompensationSnapshot[]) {
    for (const item of items) {
      this.compensations.set(item.id, { ...item });
    }
  }

  getCompensation(id: string): PaymentCompensationSnapshot | undefined {
    return this.compensations.get(id);
  }

  getPayment(id: string) {
    return this.payments.get(id);
  }

  async runInTransaction<T>(
    work: (tx: PaymentTransaction) => Promise<T>,
  ): Promise<T> {
    const tx: PaymentTransaction = {
      lockCompensation: async (compensationId: string) => {
        const current = this.compensations.get(compensationId);
        return current ? { ...current } : null;
      },
      insertPayment: async (record: PaymentCreateRecord) => {
        this.payments.set(record.id, {
          id: record.id,
          compensationId: record.compensationId,
          provider: record.provider,
          providerReference: record.providerReference,
          amount: record.amount,
          currency: record.currency,
          status: record.status,
          paidAt: record.paidAt,
        });
      },
      lockPaymentById: async (paymentId: string) => {
        const payment = this.payments.get(paymentId);
        if (!payment) {
          return null;
        }

        const compensation = this.compensations.get(payment.compensationId);
        if (!compensation) {
          return null;
        }

        return mapLockedPayment(payment, compensation);
      },
      lockPaymentByProviderReference: async (input: {
        provider: string;
        providerReference: string;
      }) => {
        const payment = [...this.payments.values()].find(
          (candidate) =>
            candidate.provider === input.provider &&
            candidate.providerReference === input.providerReference,
        );

        if (!payment) {
          return null;
        }

        const compensation = this.compensations.get(payment.compensationId);
        if (!compensation) {
          return null;
        }

        return mapLockedPayment(payment, compensation);
      },
      lockPaymentByStripePaymentIntentId: async (
        stripePaymentIntentId: string,
      ) => {
        const payment = [...this.payments.values()].find(
          (candidate) =>
            (candidate as any).stripePaymentIntentId === stripePaymentIntentId,
        );
        if (!payment) return null;
        const compensation = this.compensations.get(payment.compensationId);
        if (!compensation) return null;
        return mapLockedPayment(payment, compensation);
      },
      updatePaymentStatus: async (input: {
        paymentId: string;
        status: PaymentStatus;
        paidAt?: Date;
      }) => {
        const current = this.payments.get(input.paymentId);
        if (!current) {
          return;
        }

        this.payments.set(input.paymentId, {
          ...current,
          status: input.status,
          paidAt: input.paidAt,
        });
      },
      updateCompensationStatus: async (input: {
        compensationId: string;
        status: "pending" | "paid" | "canceled";
      }) => {
        const current = this.compensations.get(input.compensationId);
        if (!current) {
          return;
        }

        this.compensations.set(input.compensationId, {
          ...current,
          status: input.status,
        });
      },
    };

    return work(tx);
  }

  async listPendingPayments(limit: number): Promise<PendingPaymentRecord[]> {
    const pending = [...this.payments.values()]
      .filter((payment) => payment.status === "pending")
      .slice(0, limit);

    return pending
      .map((payment) => {
        const compensation = this.compensations.get(payment.compensationId);
        if (!compensation) {
          return null;
        }

        return {
          id: payment.id,
          compensationId: payment.compensationId,
          supporterUserId: compensation.supporterUserId,
          provider: payment.provider,
          providerReference: payment.providerReference,
          amount: payment.amount,
          currency: payment.currency,
          paymentStatus: "pending" as const,
          compensationStatus: compensation.status,
        };
      })
      .filter((item): item is PendingPaymentRecord => item !== null);
  }

  async getCompensationForCertificate(
    compensationId: string,
  ): Promise<CompensationCertificateSnapshot | null> {
    const item = this.compensations.get(compensationId);
    if (!item) {
      return null;
    }

    return {
      id: item.id,
      supporterUserId: item.supporterUserId,
      areaId: "area-1",
      calculationId: "calc-1",
      compensationMode: "tco2e",
      horizonYears: null,
      treesRequested: null,
      pricePerTree: null,
      estimatedTotalTCO2e: 1,
      totalTCO2e: 1,
      treesCount: 10,
      totalAmount: item.totalAmount,
      currency: item.currency,
      status: item.status,
    };
  }
}

function mapLockedPayment(
  payment: {
    id: string;
    compensationId: string;
    provider: string;
    providerReference: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    paidAt?: Date;
  },
  compensation: PaymentCompensationSnapshot,
): LockedPaymentRecord {
  return {
    id: payment.id,
    compensationId: payment.compensationId,
    supporterUserId: compensation.supporterUserId,
    provider: payment.provider,
    providerReference: payment.providerReference,
    amount: payment.amount,
    currency: payment.currency,
    paymentStatus: payment.status,
    compensationStatus: compensation.status,
    paidAt: payment.paidAt,
  };
}

class FakeGateway implements PaymentGatewayAdapter {
  readonly provider = "card_simulator";
  private readonly statusByReference = new Map<string, PaymentGatewayOutcome>();

  async createCharge(
    input: CreatePaymentChargeInput,
  ): Promise<PaymentGatewayChargeResult> {
    const outcome = resolveOutcome(input.cardNumber);
    const providerReference = `sim_${outcome}_${input.cardNumber.slice(-4)}_${Date.now()}`;
    this.statusByReference.set(providerReference, outcome);

    return {
      provider: this.provider,
      providerReference,
      outcome,
      processedAt: new Date("2026-02-07T20:00:00Z"),
    };
  }

  async getChargeStatus(input: {
    providerReference: string;
  }): Promise<PaymentGatewayStatusResult> {
    const outcome =
      this.statusByReference.get(input.providerReference) ?? "timeout";

    return {
      provider: this.provider,
      providerReference: input.providerReference,
      outcome,
      processedAt: new Date("2026-02-07T21:00:00Z"),
    };
  }

  verifyWebhookSignature(): Promise<boolean> {
    return Promise.resolve(true);
  }

  setOutcome(providerReference: string, outcome: PaymentGatewayOutcome): void {
    this.statusByReference.set(providerReference, outcome);
  }
}

class InMemoryCertificateRepository {
  readonly files: CertificateFileRecord[] = [];
  readonly certificates: CompensationCertificateRecord[] = [];

  async createFile(record: CertificateFileRecord): Promise<void> {
    this.files.push(record);
  }

  async createCertificate(
    record: CompensationCertificateRecord,
  ): Promise<void> {
    this.certificates.push(record);
  }

  async findByCompensationId(
    compensationId: string,
  ): Promise<CompensationCertificateLookup | null> {
    const certificate = this.certificates.find(
      (item) => item.compensationId === compensationId,
    );
    if (!certificate) {
      return null;
    }
    const file = this.files.find((item) => item.id === certificate.fileId);
    if (!file) {
      return null;
    }

    return {
      id: certificate.id,
      compensationId: certificate.compensationId,
      certificateNumber: certificate.certificateNumber,
      fileId: certificate.fileId,
      issuedAt: certificate.issuedAt,
      authenticityHash: certificate.authenticityHash ?? null,
      validationUrl: certificate.validationUrl ?? null,
      qrCodeData: certificate.qrCodeData ?? null,
      status: certificate.status,
      supporterUserId: file.ownerUserId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      storageUrl: file.storageUrl,
    };
  }

  async findByCertificateNumber(): Promise<CompensationCertificateLookup | null> {
    return null;
  }

  async findById(): Promise<CompensationCertificateLookup | null> {
    return null;
  }

  async listBySupporterUserId(): Promise<CompensationCertificateListItem[]> {
    return [];
  }
}

class InMemoryCertificateStorage {
  async save(params: {
    certificateId: string;
    bytes: Uint8Array;
  }): Promise<{ storagePath: string }> {
    return { storagePath: `memory://certificates/${params.certificateId}.pdf` };
  }

  async read(): Promise<Uint8Array> {
    return new Uint8Array();
  }
}

class InMemoryCertificatePdfGenerator {
  async generate(): Promise<Uint8Array> {
    return new TextEncoder().encode("%PDF-1.4\n%%EOF\n");
  }
}

function createHandlers(
  store: InMemoryPaymentStore,
  gateway: FakeGateway,
  paymentId: string,
  now: string,
) {
  return createPaymentHandlers({
    paymentStore: store,
    paymentGateway: gateway,
    compensationCertificateRepository:
      new InMemoryCertificateRepository() as any,
    compensationCertificateStorage: new InMemoryCertificateStorage() as any,
    compensationCertificatePdfGenerator:
      new InMemoryCertificatePdfGenerator() as any,
    idGenerator: {
      generate: (() => {
        let index = 0;
        const ids = [paymentId, `cert-${paymentId}`, `file-${paymentId}`];
        return () => ids[index++] ?? `id-${index}`;
      })(),
    },
    clock: { now: () => new Date(now) },
    auditLog: { async log() {} },
  });
}

function resolveOutcome(cardNumber: string): PaymentGatewayOutcome {
  switch (cardNumber) {
    case "4111111111111111":
      return "authorized";
    case "4000000000000002":
      return "declined";
    case "4000000000000101":
      return "in_review";
    case "4000000000009995":
      return "timeout";
    case "4000000000009987":
      return "canceled";
    default:
      return "authorized";
  }
}

function buildPostContext(params: {
  userId: string;
  roles?: string[];
  body: Record<string, unknown>;
  url: string;
}): HttpContext {
  return {
    request: new Request(`http://localhost${params.url}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(params.body),
    }),
    params: {},
    query: new URL(`http://localhost${params.url}`).searchParams,
    requestId: "req-1",
    clientIp: "127.0.0.1",
    auth: {
      userId: params.userId,
      roles: params.roles ?? ["individual"],
    },
  };
}

function buildGetContext(params: {
  userId: string;
  roles?: string[];
  path: string;
  routeParams: Record<string, string>;
}): HttpContext {
  return {
    request: new Request(`http://localhost${params.path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    }),
    params: params.routeParams,
    query: new URL(`http://localhost${params.path}`).searchParams,
    requestId: "req-1",
    clientIp: "127.0.0.1",
    auth: {
      userId: params.userId,
      roles: params.roles ?? ["individual"],
    },
  };
}

describe("POST /api/v1/payments/simulate", () => {
  test("authorizes payment and marks compensation as paid", async () => {
    const store = new InMemoryPaymentStore([
      {
        id: "comp-1",
        supporterUserId: "supporter-1",
        totalAmount: 120,
        currency: "BRL",
        areaId: "area-1",
        status: "pending",
      },
    ]);

    const handlers = createHandlers(
      store,
      new FakeGateway(),
      "pay-1",
      "2026-02-07T20:00:00Z",
    );

    const response = await handlers.simulate(
      buildPostContext({
        userId: "supporter-1",
        url: "/api/v1/payments/simulate",
        body: {
          compensation_id: "comp-1",
          card_number: "4111 1111 1111 1111",
          cardholder_name: "Test User",
          expiration_month: 12,
          expiration_year: 2030,
          cvv: "123",
          installments: 1,
        },
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.payment_id).toBe("pay-1");
    expect(payload.data.simulation_status).toBe("authorized");
    expect(payload.data.payment_status).toBe("paid");
    expect(payload.data.compensation_status).toBe("paid");
    expect(payload.data.certificate).not.toBeNull();
    expect(store.getPayment("pay-1")).toBeDefined();
    expect(store.getCompensation("comp-1")?.status).toBe("paid");
  });

  test("declines payment and keeps compensation pending", async () => {
    const store = new InMemoryPaymentStore([
      {
        id: "comp-2",
        supporterUserId: "supporter-1",
        totalAmount: 200,
        currency: "BRL",
        areaId: "area-1",
        status: "pending",
      },
    ]);

    const handlers = createHandlers(
      store,
      new FakeGateway(),
      "pay-2",
      "2026-02-07T20:05:00Z",
    );

    const response = await handlers.simulate(
      buildPostContext({
        userId: "supporter-1",
        url: "/api/v1/payments/simulate",
        body: {
          compensation_id: "comp-2",
          card_number: "4000 0000 0000 0002",
          cardholder_name: "Test User",
          expiration_month: 11,
          expiration_year: 2030,
          cvv: "321",
          installments: 2,
        },
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.simulation_status).toBe("declined");
    expect(payload.data.payment_status).toBe("failed");
    expect(payload.data.compensation_status).toBe("canceled");
    expect(store.getCompensation("comp-2")?.status).toBe("canceled");
  });

  test("rejects payment simulation for non-owner user", async () => {
    const store = new InMemoryPaymentStore([
      {
        id: "comp-3",
        supporterUserId: "supporter-1",
        totalAmount: 200,
        currency: "BRL",
        areaId: "area-1",
        status: "pending",
      },
    ]);

    const handlerWithOtherUser = createHandlers(
      store,
      new FakeGateway(),
      "pay-3",
      "2026-02-07T20:10:00Z",
    );

    const response = await handlerWithOtherUser.simulate(
      buildPostContext({
        userId: "other-user",
        url: "/api/v1/payments/simulate",
        body: {
          compensation_id: "comp-3",
          card_number: "4111111111111111",
          cardholder_name: "Other User",
          expiration_month: 10,
          expiration_year: 2030,
          cvv: "123",
          installments: 1,
        },
      }),
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error.message_key).toBe("auth.forbidden");
  });

  test("validates invalid card payload", async () => {
    const store = new InMemoryPaymentStore([
      {
        id: "comp-4",
        supporterUserId: "supporter-1",
        totalAmount: 200,
        currency: "BRL",
        areaId: "area-1",
        status: "pending",
      },
    ]);

    const handlers = createHandlers(
      store,
      new FakeGateway(),
      "pay-4",
      "2026-02-07T20:12:00Z",
    );

    const response = await handlers.simulate(
      buildPostContext({
        userId: "supporter-1",
        url: "/api/v1/payments/simulate",
        body: {
          compensation_id: "comp-4",
          card_number: "1234",
          cardholder_name: "Test",
          expiration_month: 10,
          expiration_year: 2030,
          cvv: "12",
          installments: 0,
        },
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.message_key).toBe("request.validation_failed");
  });
});

describe("GET /api/v1/payments/:id/status", () => {
  test("queries adapter and syncs status from pending to paid", async () => {
    const store = new InMemoryPaymentStore([
      {
        id: "comp-5",
        supporterUserId: "supporter-1",
        totalAmount: 300,
        currency: "BRL",
        areaId: "area-1",
        status: "pending",
      },
    ]);

    const gateway = new FakeGateway();
    const handlers = createHandlers(
      store,
      gateway,
      "pay-5",
      "2026-02-07T20:20:00Z",
    );

    const simulateResponse = await handlers.simulate(
      buildPostContext({
        userId: "supporter-1",
        url: "/api/v1/payments/simulate",
        body: {
          compensation_id: "comp-5",
          card_number: "4000000000009995",
          cardholder_name: "Retry User",
          expiration_month: 10,
          expiration_year: 2030,
          cvv: "123",
          installments: 1,
        },
      }),
    );

    expect(simulateResponse.status).toBe(201);
    const simulatedPayload = await simulateResponse.json();
    expect(simulatedPayload.data.payment_status).toBe("pending");

    gateway.setOutcome(simulatedPayload.data.provider_reference, "authorized");

    const statusResponse = await handlers.status(
      buildGetContext({
        userId: "supporter-1",
        path: `/api/v1/payments/${simulatedPayload.data.payment_id}/status`,
        routeParams: { id: simulatedPayload.data.payment_id as string },
      }),
      simulatedPayload.data.payment_id as string,
    );

    expect(statusResponse.status).toBe(200);
    const statusPayload = await statusResponse.json();
    expect(statusPayload.data.payment_status).toBe("paid");
    expect(statusPayload.data.compensation_status).toBe("paid");
    // Local DB is only updated by webhook, not by status polling
    expect(store.getCompensation("comp-5")?.status).toBe("pending");
  });
});
