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

  test('rejects when area has insufficient available capacity', async () => {
    await expect(
      createCompensationAtomic(
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
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(store.compensations.length).toBe(0);
    expect(store.area.committedTCO2e).toBe(0);
  });

  test('prevents double counting under concurrent requests', async () => {
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
    const rejected = [first, second].filter(
      (entry) => entry.status === 'rejected'
    );

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(store.compensations.length).toBe(1);
    expect(store.area.committedTCO2e).toBe(4);
  });
});
