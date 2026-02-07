import { describe, expect, test } from 'bun:test';
import { createPaymentHandlers } from '../src/infrastructure/http/payment-handlers';
import type {
  PaymentCompensationSnapshot,
  PaymentCreateRecord,
  PaymentSimulationStore,
  PaymentSimulationTransaction,
} from '../src/application/payments/simulate-card-payment';
import type { HttpContext } from '../src/shared/http/router';

class InMemoryPaymentSimulationStore implements PaymentSimulationStore {
  private readonly compensations = new Map<string, PaymentCompensationSnapshot>();
  readonly payments: PaymentCreateRecord[] = [];

  constructor(items: PaymentCompensationSnapshot[]) {
    for (const item of items) {
      this.compensations.set(item.id, { ...item });
    }
  }

  getCompensation(id: string): PaymentCompensationSnapshot | undefined {
    return this.compensations.get(id);
  }

  async runInTransaction<T>(
    work: (tx: PaymentSimulationTransaction) => Promise<T>
  ): Promise<T> {
    const tx: PaymentSimulationTransaction = {
      lockCompensation: async (compensationId: string) => {
        const current = this.compensations.get(compensationId);
        return current ? { ...current } : null;
      },
      insertPayment: async (record: PaymentCreateRecord) => {
        this.payments.push(record);
      },
      updateCompensationStatus: async (
        compensationId: string,
        status: 'paid'
      ) => {
        const current = this.compensations.get(compensationId);
        if (!current) return;
        this.compensations.set(compensationId, {
          ...current,
          status,
        });
      },
    };
    return work(tx);
  }
}

function buildContext(params: {
  userId: string;
  roles?: string[];
  body: Record<string, unknown>;
}): HttpContext {
  return {
    request: new Request('http://localhost/api/v1/payments/simulate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(params.body),
    }),
    params: {},
    query: new URL('http://localhost/api/v1/payments/simulate').searchParams,
    requestId: 'req-1',
    clientIp: '127.0.0.1',
    auth: {
      userId: params.userId,
      roles: params.roles ?? ['individual'],
    },
  };
}

describe('POST /api/v1/payments/simulate', () => {
  test('authorizes payment and marks compensation as paid', async () => {
    const store = new InMemoryPaymentSimulationStore([
      {
        id: 'comp-1',
        supporterUserId: 'supporter-1',
        totalAmount: 120,
        currency: 'BRL',
        status: 'pending',
      },
    ]);

    const handlers = createPaymentHandlers({
      paymentSimulationStore: store,
      idGenerator: { generate: () => 'pay-1' },
      clock: { now: () => new Date('2026-02-07T20:00:00Z') },
      auditLog: { async log() {} },
    });

    const response = await handlers.simulate(
      buildContext({
        userId: 'supporter-1',
        body: {
          compensation_id: 'comp-1',
          card_number: '4111 1111 1111 1111',
          cardholder_name: 'Test User',
          expiration_month: 12,
          expiration_year: 2030,
          cvv: '123',
          installments: 1,
        },
      })
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.payment_id).toBe('pay-1');
    expect(payload.data.simulation_status).toBe('authorized');
    expect(payload.data.payment_status).toBe('paid');
    expect(payload.data.compensation_status).toBe('paid');
    expect(store.payments).toHaveLength(1);
    expect(store.getCompensation('comp-1')?.status).toBe('paid');
  });

  test('declines payment and keeps compensation pending', async () => {
    const store = new InMemoryPaymentSimulationStore([
      {
        id: 'comp-2',
        supporterUserId: 'supporter-1',
        totalAmount: 200,
        currency: 'BRL',
        status: 'pending',
      },
    ]);

    const handlers = createPaymentHandlers({
      paymentSimulationStore: store,
      idGenerator: { generate: () => 'pay-2' },
      clock: { now: () => new Date('2026-02-07T20:05:00Z') },
      auditLog: { async log() {} },
    });

    const response = await handlers.simulate(
      buildContext({
        userId: 'supporter-1',
        body: {
          compensation_id: 'comp-2',
          card_number: '4000 0000 0000 0002',
          cardholder_name: 'Test User',
          expiration_month: 11,
          expiration_year: 2030,
          cvv: '321',
          installments: 2,
        },
      })
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.data.simulation_status).toBe('declined');
    expect(payload.data.payment_status).toBe('failed');
    expect(payload.data.compensation_status).toBe('pending');
    expect(store.getCompensation('comp-2')?.status).toBe('pending');
  });

  test('rejects payment simulation for non-owner user', async () => {
    const store = new InMemoryPaymentSimulationStore([
      {
        id: 'comp-3',
        supporterUserId: 'supporter-1',
        totalAmount: 200,
        currency: 'BRL',
        status: 'pending',
      },
    ]);

    const handlers = createPaymentHandlers({
      paymentSimulationStore: store,
      idGenerator: { generate: () => 'pay-3' },
      clock: { now: () => new Date('2026-02-07T20:10:00Z') },
      auditLog: { async log() {} },
    });

    const response = await handlers.simulate(
      buildContext({
        userId: 'other-user',
        body: {
          compensation_id: 'comp-3',
          card_number: '4111111111111111',
          cardholder_name: 'Other User',
          expiration_month: 10,
          expiration_year: 2030,
          cvv: '123',
          installments: 1,
        },
      })
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error.message_key).toBe('auth.forbidden');
  });

  test('validates invalid card payload', async () => {
    const store = new InMemoryPaymentSimulationStore([
      {
        id: 'comp-4',
        supporterUserId: 'supporter-1',
        totalAmount: 200,
        currency: 'BRL',
        status: 'pending',
      },
    ]);

    const handlers = createPaymentHandlers({
      paymentSimulationStore: store,
      idGenerator: { generate: () => 'pay-4' },
      clock: { now: () => new Date('2026-02-07T20:12:00Z') },
      auditLog: { async log() {} },
    });

    const response = await handlers.simulate(
      buildContext({
        userId: 'supporter-1',
        body: {
          compensation_id: 'comp-4',
          card_number: '1234',
          cardholder_name: 'Test',
          expiration_month: 10,
          expiration_year: 2030,
          cvv: '12',
          installments: 0,
        },
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.message_key).toBe('request.validation_failed');
  });
});
