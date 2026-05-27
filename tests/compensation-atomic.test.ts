import { beforeEach, describe, expect, test } from "bun:test";
import {
  createCompensationAtomic,
  type CompensationAtomicStore,
  type CompensationAtomicTransaction,
  type CompensationAreaSnapshot,
  type CompensationCreateRecord,
} from "../src/application/compensations/create-compensation-atomic";

class InMemoryCompensationStore implements CompensationAtomicStore {
  area: CompensationAreaSnapshot = {
    id: "area-1",
    status: "active",
    maxPurchasableTrees: 1000,
  };
  compensations: CompensationCreateRecord[] = [];
  private lock: Promise<void> = Promise.resolve();
  paidTreeCountByArea: Map<string, number> = new Map();

  async runInTransaction<T>(
    work: (tx: CompensationAtomicTransaction) => Promise<T>,
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
        insertCompensation: async (record: CompensationCreateRecord) => {
          this.compensations.push(record);
        },
        sumCommittedTreeCountByArea: async (areaId: string) => {
          return this.paidTreeCountByArea.get(areaId) ?? 0;
        },
      };

      return await work(tx);
    } finally {
      release?.();
    }
  }
}

describe("createCompensationAtomic", () => {
  let store: InMemoryCompensationStore;
  let sequence = 0;

  beforeEach(() => {
    store = new InMemoryCompensationStore();
    sequence = 0;
  });

  test("creates pending tree contribution with snapshot fields", async () => {
    const result = await createCompensationAtomic(
      {
        store,
        idGenerator: {
          generate: () => `comp-${++sequence}`,
        },
        clock: {
          now: () => new Date("2026-02-07T15:00:00Z"),
        },
        auditLog: {
          async log() {},
        },
        defaultMaxPurchasableTrees: 100,
      },
      {
        supporterUserId: "supporter-1",
        areaId: "area-1",
        calculationId: "calc-1",
        compensationMode: "tree_purchase",
        horizonYears: 20,
        treesRequested: 100,
        pricePerTree: 2.5,
        estimatedTotalTCO2e: 2.5,
        totalTCO2e: 2.5,
        totalAmount: 250,
        currency: "BRL",
        treesCount: 100,
      },
    );

    expect(result.compensationId).toBe("comp-1");
    expect(result.compensationMode).toBe("tree_purchase");
    expect(store.compensations.length).toBe(1);
    expect(store.compensations[0].totalCO2Kg).toBe(2500);
    expect(store.compensations[0].estimatedTotalTCO2e).toBe(2.5);
    expect(store.compensations[0].horizonYears).toBe(20);
    expect(store.compensations[0].treesRequested).toBe(100);
  });

  test("allows concurrent contribution creation without area stock mutation", async () => {
    const deps = {
      store,
      idGenerator: {
        generate: () => `comp-${++sequence}`,
      },
      clock: {
        now: () => new Date("2026-02-07T15:00:00Z"),
      },
      auditLog: {
        async log() {},
      },
      defaultMaxPurchasableTrees: 100,
    };

    const [first, second] = await Promise.allSettled([
      createCompensationAtomic(deps, {
        supporterUserId: "supporter-1",
        areaId: "area-1",
        compensationMode: "tree_purchase",
        horizonYears: 20,
        treesRequested: 150,
        pricePerTree: 2.67,
        estimatedTotalTCO2e: 4,
        totalTCO2e: 4,
        totalAmount: 400,
        currency: "BRL",
        treesCount: 150,
      }),
      createCompensationAtomic(deps, {
        supporterUserId: "supporter-2",
        areaId: "area-1",
        compensationMode: "tree_purchase",
        horizonYears: 20,
        treesRequested: 150,
        pricePerTree: 2.67,
        estimatedTotalTCO2e: 4,
        totalTCO2e: 4,
        totalAmount: 400,
        currency: "BRL",
        treesCount: 150,
      }),
    ]);

    const fulfilled = [first, second].filter(
      (entry) => entry.status === "fulfilled",
    );

    expect(fulfilled.length).toBe(2);
    expect(store.compensations.length).toBe(2);
    expect(
      store.compensations.every(
        (item) => item.compensationMode === "tree_purchase",
      ),
    ).toBe(true);
  });
});
