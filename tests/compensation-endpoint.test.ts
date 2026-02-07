import { describe, expect, test } from 'bun:test';
import { createCompensationHandlers } from '../src/infrastructure/http/compensation-handlers';
import type {
  CompensationAtomicStore,
  CompensationAtomicTransaction,
  CompensationAreaSnapshot,
  CompensationCreateRecord
} from '../src/application/compensations/create-compensation-atomic';
import type { HttpContext } from '../src/shared/http/router';

class InMemoryCompensationStore implements CompensationAtomicStore {
  constructor(private area: CompensationAreaSnapshot) {}

  async runInTransaction<T>(
    work: (tx: CompensationAtomicTransaction) => Promise<T>
  ): Promise<T> {
    const tx: CompensationAtomicTransaction = {
      lockArea: async (areaId: string) => {
        if (this.area.id !== areaId) {
          return null;
        }
        return { ...this.area };
      },
      updateAreaCommitted: async (_areaId: string, committedTCO2e: number) => {
        this.area = { ...this.area, committedTCO2e };
      },
      insertCompensation: async (_record: CompensationCreateRecord) => {},
    };
    return work(tx);
  }
}

function buildContext(body: Record<string, unknown>): HttpContext {
  return {
    request: new Request('http://localhost/api/v1/compensations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    params: {},
    query: new URL('http://localhost/api/v1/compensations').searchParams,
    requestId: 'req-1',
    clientIp: '127.0.0.1',
    auth: {
      userId: 'supporter-1',
      roles: ['individual'],
    },
  };
}

describe('POST /api/v1/compensations handler', () => {
  test('returns 201 with compensation payload', async () => {
    const handlers = createCompensationHandlers({
      compensationStore: new InMemoryCompensationStore({
        id: 'area-1',
        status: 'active',
        totalCapacityTCO2e: 10,
        committedTCO2e: 1,
      }),
      idGenerator: {
        generate: () => 'comp-123',
      },
      clock: {
        now: () => new Date('2026-02-07T16:00:00Z'),
      },
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.create(
      buildContext({
        area_id: 'area-1',
        calculation_id: 'calc-1',
        total_t_co2e: 2.5,
        trees_count: 120,
        total_amount: 250,
        currency: 'brl',
      })
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.message_key).toBe('compensation.created_pending');
    expect(payload.data.compensation_id).toBe('comp-123');
    expect(payload.data.area_id).toBe('area-1');
    expect(payload.data.total_t_co2e).toBe(2.5);
    expect(payload.data.trees_count).toBe(120);
    expect(payload.data.status).toBe('pending');
  });

  test('returns 400 when request is invalid', async () => {
    const handlers = createCompensationHandlers({
      compensationStore: new InMemoryCompensationStore({
        id: 'area-1',
        status: 'active',
        totalCapacityTCO2e: 10,
        committedTCO2e: 1,
      }),
      idGenerator: {
        generate: () => 'comp-123',
      },
      clock: {
        now: () => new Date('2026-02-07T16:00:00Z'),
      },
      auditLog: {
        async log() {},
      },
    });

    const response = await handlers.create(
      buildContext({
        area_id: 'area-1',
        total_t_co2e: -1,
        trees_count: 120,
        total_amount: 250,
        currency: 'BRL',
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.message_key).toBe('request.validation_failed');
  });
});
