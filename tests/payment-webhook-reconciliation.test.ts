import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import Stripe from 'stripe';
import { createPaymentHandlers } from '../src/infrastructure/http/payment-handlers';
import { resetStripeClient } from '../src/infrastructure/payments/stripe-client';
import type { HttpContext } from '../src/shared/http/router';
import type {
  CompensationCertificateSnapshot,
  LockedPaymentRecord,
  PaymentCompensationSnapshot,
  PaymentCreateRecord,
  PaymentStatus,
  PaymentStore,
  PaymentTransaction,
  PendingPaymentRecord,
} from '../src/application/payments/payment-store';
import type {
  CreatePaymentChargeInput,
  PaymentGatewayAdapter,
  PaymentGatewayOutcome,
  PaymentGatewayChargeResult,
  PaymentGatewayStatusResult,
} from '../src/application/payments/payment-gateway';
import type {
  CertificateFileRecord,
  CompensationCertificateListItem,
  CompensationCertificateLookup,
  CompensationCertificateRecord,
} from '../src/domain/compensations/repositories/compensation-certificate-repository';

class InMemoryPaymentStore implements PaymentStore {
  private readonly compensations = new Map<string, PaymentCompensationSnapshot>();
  private readonly payments = new Map<string, {
    id: string;
    compensationId: string;
    provider: string;
    providerReference: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    paidAt?: Date;
  }>();

  addCompensation(item: PaymentCompensationSnapshot): void {
    this.compensations.set(item.id, { ...item });
  }

  addPayment(item: {
    id: string;
    compensationId: string;
    provider: string;
    providerReference: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
  }): void {
    this.payments.set(item.id, { ...item });
  }

  getCompensation(id: string): PaymentCompensationSnapshot | undefined {
    return this.compensations.get(id);
  }

  getPayment(id: string) {
    return this.payments.get(id);
  }

  async runInTransaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    const tx: PaymentTransaction = {
      lockCompensation: async (compensationId: string) => {
        const current = this.compensations.get(compensationId);
        return current ? { ...current } : null;
      },
      lockLatestPendingPaymentByCompensationId: async () => null,
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

        return this.mapLockedPayment(payment, compensation);
      },
      lockPaymentByProviderReference: async (input: {
        provider: string;
        providerReference: string;
      }) => {
        const payment = [...this.payments.values()].find(
          (candidate) =>
            candidate.provider === input.provider &&
            candidate.providerReference === input.providerReference
        );

        if (!payment) {
          return null;
        }

        const compensation = this.compensations.get(payment.compensationId);
        if (!compensation) {
          return null;
        }

        return this.mapLockedPayment(payment, compensation);
      },
      lockPaymentByStripePaymentIntentId: async (
        stripePaymentIntentId: string
      ) => {
        const payment = [...this.payments.values()].find(
          (candidate) =>
            (candidate as any).stripePaymentIntentId === stripePaymentIntentId
        );
        if (!payment) return null;
        const compensation = this.compensations.get(payment.compensationId);
        if (!compensation) return null;
        return this.mapLockedPayment(payment, compensation);
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
        status: 'pending' | 'paid' | 'canceled';
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
    return [...this.payments.values()]
      .filter((payment) => payment.status === 'pending')
      .slice(0, limit)
      .map((payment) => {
        const compensation = this.compensations.get(payment.compensationId)!;
        return {
          id: payment.id,
          compensationId: payment.compensationId,
          supporterUserId: compensation.supporterUserId,
          provider: payment.provider,
          providerReference: payment.providerReference,
          amount: payment.amount,
          currency: payment.currency,
          paymentStatus: 'pending' as const,
          compensationStatus: compensation.status,
        };
      });
  }

  async getCompensationForCertificate(
    compensationId: string
  ): Promise<CompensationCertificateSnapshot | null> {
    const item = this.compensations.get(compensationId);
    if (!item) {
      return null;
    }

    return {
      id: item.id,
      supporterUserId: item.supporterUserId,
      areaId: 'area-1',
      calculationId: 'calc-1',
      compensationMode: 'tco2e',
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

  private mapLockedPayment(
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
    compensation: PaymentCompensationSnapshot
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
}

class StripeWebhookGatewayStub implements PaymentGatewayAdapter {
  readonly provider = 'stripe';

  async createCharge(
    _input: CreatePaymentChargeInput
  ): Promise<PaymentGatewayChargeResult> {
    return {
      provider: this.provider,
      providerReference: 'pi_stub',
      outcome: 'authorized',
      processedAt: new Date('2026-02-07T20:00:00Z'),
    };
  }

  async getChargeStatus(input: {
    providerReference: string;
  }): Promise<PaymentGatewayStatusResult> {
    return {
      provider: this.provider,
      providerReference: input.providerReference,
      outcome: 'authorized',
      processedAt: new Date('2026-02-07T21:00:00Z'),
    };
  }

  verifyWebhookSignature(input: {
    payload: string;
    signature: string | null;
  }): boolean {
    return Boolean(input.payload && input.signature);
  }

  parseWebhookEvent(_rawPayload: string, _signature: string): {
    type: string;
    paymentIntentId: string | null;
    outcome: PaymentGatewayOutcome | null;
  } {
    return {
      type: 'account.updated',
      paymentIntentId: null,
      outcome: null,
    };
  }
}

class MutableGateway implements PaymentGatewayAdapter {
  readonly provider = 'card_simulator';

  constructor(private readonly secret: string) {}

  private readonly statuses = new Map<string, PaymentGatewayOutcome>();

  async createCharge(
    input: CreatePaymentChargeInput
  ): Promise<PaymentGatewayChargeResult> {
    const providerReference = `sim_authorized_${input.cardNumber.slice(-4)}_${Date.now()}`;
    this.statuses.set(providerReference, 'authorized');

    return {
      provider: this.provider,
      providerReference,
      outcome: 'authorized',
      processedAt: new Date('2026-02-07T20:00:00Z'),
    };
  }

  async getChargeStatus(input: {
    providerReference: string;
  }): Promise<PaymentGatewayStatusResult> {
    return {
      provider: this.provider,
      providerReference: input.providerReference,
      outcome: this.statuses.get(input.providerReference) ?? 'timeout',
      processedAt: new Date('2026-02-07T21:00:00Z'),
    };
  }

  verifyWebhookSignature(input: {
    payload: string;
    signature: string | null;
  }): boolean {
    if (!input.signature) {
      return false;
    }

    const received = input.signature.startsWith('sha256=')
      ? input.signature.slice('sha256='.length)
      : input.signature;

    const expected = createHmac('sha256', this.secret)
      .update(input.payload, 'utf-8')
      .digest('hex');

    return received === expected;
  }

  setStatus(providerReference: string, outcome: PaymentGatewayOutcome): void {
    this.statuses.set(providerReference, outcome);
  }
}

class InMemoryCertificateRepository {
  readonly files: CertificateFileRecord[] = [];
  readonly certificates: CompensationCertificateRecord[] = [];

  async createFile(record: CertificateFileRecord): Promise<void> {
    this.files.push(record);
  }

  async createCertificate(record: CompensationCertificateRecord): Promise<void> {
    this.certificates.push(record);
  }

  async findByCompensationId(
    compensationId: string
  ): Promise<CompensationCertificateLookup | null> {
    const certificate = this.certificates.find(
      (item) => item.compensationId === compensationId
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
    return new TextEncoder().encode('%PDF-1.4\n%%EOF\n');
  }
}

function createHandlers(
  store: InMemoryPaymentStore,
  gateway: MutableGateway,
  paymentId: string,
  now: string
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

function buildWebhookContext(params: {
  body: string;
  signature?: string;
  stripeSignature?: string;
}): HttpContext {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (params.signature != null) {
    headers['x-payment-signature'] = params.signature;
  }
  if (params.stripeSignature != null) {
    headers['stripe-signature'] = params.stripeSignature;
  }
  const context: HttpContext = {
    request: new Request('http://localhost/api/v1/payments/webhook', {
      method: 'POST',
      headers,
      body: params.body,
    }),
    params: {},
    query: new URL('http://localhost/api/v1/payments/webhook').searchParams,
    requestId: 'req-webhook',
    clientIp: '127.0.0.1',
  };
  return context;
}

function buildReconcileContext(body: Record<string, unknown>): HttpContext {
  return {
    request: new Request('http://localhost/api/v1/payments/reconcile', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    params: {},
    query: new URL('http://localhost/api/v1/payments/reconcile').searchParams,
    requestId: 'req-reconcile',
    clientIp: '127.0.0.1',
    auth: {
      userId: 'admin-1',
      roles: ['administrator'],
    },
  };
}

describe('payment webhook and reconciliation', () => {
  test('rejects webhook with invalid signature', async () => {
    const secret = 'payment-secret';
    const gateway = new MutableGateway(secret);
    const store = new InMemoryPaymentStore();
    const handlers = createHandlers(
      store,
      gateway,
      'pay-1',
      '2026-02-07T22:00:00Z'
    );

    const body = JSON.stringify({
      provider: 'card_simulator',
      event: 'payment.updated',
      data: {
        provider_reference: 'sim_authorized_1111_1',
      },
    });

    const response = await handlers.webhook(
      buildWebhookContext({
        body,
        signature: 'sha256=invalid',
      })
    );

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error.message_key).toBe('payment.webhook_invalid_signature');
  });

  test('processes webhook and updates payment + compensation status', async () => {
    const secret = 'payment-secret';
    const gateway = new MutableGateway(secret);
    const store = new InMemoryPaymentStore();

    store.addCompensation({
      id: 'comp-1',
      supporterUserId: 'supporter-1',
      totalAmount: 100,
      currency: 'BRL',
      areaId: 'area-1',
      status: 'pending',
    });

    const providerReference = 'sim_authorized_1111_1';
    store.addPayment({
      id: 'pay-1',
      compensationId: 'comp-1',
      provider: 'card_simulator',
      providerReference,
      amount: 100,
      currency: 'BRL',
      status: 'pending',
    });

    gateway.setStatus(providerReference, 'authorized');

    const handlers = createHandlers(
      store,
      gateway,
      'pay-1',
      '2026-02-07T22:10:00Z'
    );

    const body = JSON.stringify({
      provider: 'card_simulator',
      event: 'payment.updated',
      data: {
        provider_reference: providerReference,
      },
    });
    const signature = createHmac('sha256', secret).update(body, 'utf-8').digest('hex');

    const response = await handlers.webhook(
      buildWebhookContext({
        body,
        signature: `sha256=${signature}`,
      })
    );

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.data.processed).toBe(true);
    expect(payload.data.payment_status).toBe('paid');
    expect(payload.data.compensation_status).toBe('paid');
    expect(store.getPayment('pay-1')?.status).toBe('paid');
    expect(store.getCompensation('comp-1')?.status).toBe('paid');
  });

  test('reconciles pending payments and updates only resolved ones', async () => {
    const secret = 'payment-secret';
    const gateway = new MutableGateway(secret);
    const store = new InMemoryPaymentStore();

    store.addCompensation({
      id: 'comp-a',
      supporterUserId: 'supporter-a',
      totalAmount: 100,
      currency: 'BRL',
      areaId: 'area-a',
      status: 'pending',
    });
    store.addCompensation({
      id: 'comp-b',
      supporterUserId: 'supporter-b',
      totalAmount: 80,
      currency: 'BRL',
      areaId: 'area-b',
      status: 'pending',
    });

    store.addPayment({
      id: 'pay-a',
      compensationId: 'comp-a',
      provider: 'card_simulator',
      providerReference: 'sim_authorized_1111_1',
      amount: 100,
      currency: 'BRL',
      status: 'pending',
    });
    store.addPayment({
      id: 'pay-b',
      compensationId: 'comp-b',
      provider: 'card_simulator',
      providerReference: 'sim_timeout_2222_1',
      amount: 80,
      currency: 'BRL',
      status: 'pending',
    });

    gateway.setStatus('sim_authorized_1111_1', 'authorized');
    gateway.setStatus('sim_timeout_2222_1', 'timeout');

    const handlers = createHandlers(
      store,
      gateway,
      'pay-a',
      '2026-02-07T22:20:00Z'
    );

    const response = await handlers.reconcile(buildReconcileContext({ limit: 20 }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.inspected).toBe(2);
    expect(payload.data.updated).toBe(1);
    expect(payload.data.marked_paid).toBe(1);
    expect(payload.data.marked_failed).toBe(0);
    expect(payload.data.remained_pending).toBe(1);
    expect(store.getPayment('pay-a')?.status).toBe('paid');
    expect(store.getCompensation('comp-a')?.status).toBe('paid');
    expect(store.getPayment('pay-b')?.status).toBe('pending');
    expect(store.getCompensation('comp-b')?.status).toBe('pending');
  });

  test('processes stripe account.updated webhook and syncs connect status', async () => {
    resetStripeClient();
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub_for_webhook';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_account_updated';

    const store = new InMemoryPaymentStore();
    const gateway = new StripeWebhookGatewayStub();
    const updatedCalls: Array<{
      id: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
    }> = [];

    const handlers = createPaymentHandlers({
      paymentStore: store,
      paymentGateway: gateway,
      compensationCertificateRepository:
        new InMemoryCertificateRepository() as any,
      compensationCertificateStorage: new InMemoryCertificateStorage() as any,
      compensationCertificatePdfGenerator:
        new InMemoryCertificatePdfGenerator() as any,
      idGenerator: { generate: () => 'id-1' },
      clock: { now: () => new Date('2026-02-07T23:00:00Z') },
      auditLog: { async log() {} },
      stripeConnectRepository: {
        async findByStripeAccountId(accountId: string) {
          if (accountId !== 'acct_test_123') return null;
          return {
            id: 'sca-1',
            userId: 'producer-1',
            stripeAccountId: 'acct_test_123',
            chargesEnabled: false,
            payoutsEnabled: false,
            country: 'BR',
            createdAt: new Date('2026-02-01T00:00:00Z'),
            updatedAt: new Date('2026-02-01T00:00:00Z'),
          };
        },
        async updateStatus(
          id: string,
          chargesEnabled: boolean,
          payoutsEnabled: boolean
        ) {
          updatedCalls.push({ id, chargesEnabled, payoutsEnabled });
        },
      } as any,
    });

    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_123',
          object: 'account',
          charges_enabled: true,
          payouts_enabled: true,
        },
      },
    });

    const stripeSignature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    const response = await handlers.webhook(
      buildWebhookContext({
        body: payload,
        stripeSignature,
      })
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.data.processed).toBe(true);
    expect(updatedCalls).toHaveLength(1);
    expect(updatedCalls[0]).toEqual({
      id: 'sca-1',
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  });
});
