import { beforeEach, describe, expect, test } from 'bun:test';
import {
  createCompensationAtomic,
  type CompensationAtomicStore,
  type CompensationAtomicTransaction,
  type CompensationAreaSnapshot,
  type CompensationCreateRecord
} from '../src/application/compensations/create-compensation-atomic';

class InMemoryCompensationStore implements CompensationAtomicStore {
  area: CompensationAreaSnapshot = {
    id: 'area-1',
    status: 'active',
    totalCapacityTCO2e: 5,
    committedTCO2e: 0,
  };
  compensations: CompensationCreateRecord[] = [];
  private lock: Promise<void> = Promise.resolve();

  async runInTransaction<T>(
    work: (tx: CompensationAtomicTransaction) => Promise<T>
  ): Promise<T> {
    let release: (() => void) | undefined;
    const waitForTurn = this.lock;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await waitForTurn;

    try {
      const tx: CompensationAtomicTransaction = {
        lockArea: async (areaId: string) => {
          if (this.area.id !== areaId) {
            return null;
          }
          return { ...this.area };
        },
        updateAreaCommitted: async (_areaId: string, committedTCO2e: number) => {
          this.area = {
            ...this.area,
            committedTCO2e,
          };
        },
        insertCompensation: async (record: CompensationCreateRecord) => {
          this.compensations.push(record);
        },
      };

      return await work(tx);
    } finally {
      release?.();
    }
  }
}

describe('createCompensationAtomic', () => {
  let store: InMemoryCompensationStore;
  let sequence = 0;

  beforeEach(() => {
    store = new InMemoryCompensationStore();
    sequence = 0;
  });

  test('creates compensation and reserves committed capacity', async () => {
    const result = await createCompensationAtomic(
      {
        store,
        idGenerator: {
          generate: () => `comp-${++sequence}`,
        },
        clock: {
          now: () => new Date('2026-02-07T15:00:00Z'),
        },
        auditLog: {
          async log() {},
        },
      },
      {
        supporterUserId: 'supporter-1',
        areaId: 'area-1',
        calculationId: 'calc-1',
        totalTCO2e: 2.5,
        totalAmount: 250,
        currency: 'BRL',
        treesCount: 100,
      }
    );

    expect(result.compensationId).toBe('comp-1');
    expect(store.area.committedTCO2e).toBe(2.5);
    expect(store.compensations.length).toBe(1);
    expect(store.compensations[0].totalCO2Kg).toBe(2500);
  });

  test('allows over-commitment beyond available capacity', async () => {
    const result = await createCompensationAtomic(
      {
        store,
        idGenerator: {
          generate: () => `comp-${++sequence}`,
        },
        clock: {
          now: () => new Date('2026-02-07T15:00:00Z'),
        },
        auditLog: {
          async log() {},
        },
      },
      {
        supporterUserId: 'supporter-1',
        areaId: 'area-1',
        totalTCO2e: 6,
        totalAmount: 600,
        currency: 'BRL',
        treesCount: 200,
      }
    );

    // Should succeed even though 6 tCO2e exceeds available capacity (5 tCO2e)
    expect(result.compensationId).toBe('comp-1');
    expect(store.area.committedTCO2e).toBe(6);
    expect(store.compensations.length).toBe(1);
    expect(result.remainingTCO2e).toBe(0); // Negative clamped to 0 in display
  });

  test('allows both concurrent requests with over-commitment', async () => {
    const deps = {
      store,
      idGenerator: {
        generate: () => `comp-${++sequence}`,
      },
      clock: {
        now: () => new Date('2026-02-07T15:00:00Z'),
      },
      auditLog: {
        async log() {},
      },
    };

    const [first, second] = await Promise.allSettled([
      createCompensationAtomic(deps, {
        supporterUserId: 'supporter-1',
        areaId: 'area-1',
        totalTCO2e: 4,
        totalAmount: 400,
        currency: 'BRL',
        treesCount: 150,
      }),
      createCompensationAtomic(deps, {
        supporterUserId: 'supporter-2',
        areaId: 'area-1',
        totalTCO2e: 4,
        totalAmount: 400,
        currency: 'BRL',
        treesCount: 150,
      }),
    ]);

    const fulfilled = [first, second].filter(
      (entry) => entry.status === 'fulfilled'
    );

    // Both requests should succeed, allowing over-commitment
    expect(fulfilled.length).toBe(2);
    expect(store.compensations.length).toBe(2);
    // Total committed: 8 tCO2e (exceeds capacity of 5)
    expect(store.area.committedTCO2e).toBe(8);
  });

  test('allows both concurrent tree_purchase requests with over-commitment', async () => {
    const deps = {
      store,
      idGenerator: {
        generate: () => `comp-${++sequence}`,
      },
      clock: {
        now: () => new Date('2026-02-07T15:00:00Z'),
      },
      auditLog: {
        async log() {},
      },
    };

    const [first, second] = await Promise.allSettled([
      createCompensationAtomic(deps, {
        supporterUserId: 'supporter-1',
        areaId: 'area-1',
        compensationMode: 'tree_purchase',
        horizonYears: 20,
        treesRequested: 10,
        pricePerTree: 12,
        estimatedTotalTCO2e: 3,
        totalTCO2e: 3,
        totalAmount: 120,
        currency: 'BRL',
        treesCount: 10,
      }),
      createCompensationAtomic(deps, {
        supporterUserId: 'supporter-2',
        areaId: 'area-1',
        compensationMode: 'tree_purchase',
        horizonYears: 20,
        treesRequested: 10,
        pricePerTree: 12,
        estimatedTotalTCO2e: 3,
        totalTCO2e: 3,
        totalAmount: 120,
        currency: 'BRL',
        treesCount: 10,
      }),
    ]);

    const fulfilled = [first, second].filter(
      (entry) => entry.status === 'fulfilled'
    );

    // Both tree_purchase requests should succeed
    expect(fulfilled.length).toBe(2);
    expect(store.compensations.length).toBe(2);
    expect(store.compensations[0].compensationMode).toBe('tree_purchase');
    expect(store.compensations[0].treesRequested).toBe(10);
    expect(store.compensations[0].horizonYears).toBe(20);
    // Total committed: 6 tCO2e (exceeds capacity of 5)
    expect(store.area.committedTCO2e).toBe(6);
  });
});
