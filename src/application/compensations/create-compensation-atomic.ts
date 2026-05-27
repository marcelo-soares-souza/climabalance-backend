import { NotFoundError, ValidationError } from "../../domain/errors";

/**
 * Input required to atomically create a pending compensation.
 */
export type CreateCompensationAtomicInput = {
  supporterUserId: string;
  areaId: string;
  calculationId?: string;
  compensationMode?: "tree_purchase";
  horizonYears?: number;
  treesRequested?: number;
  pricePerTree?: number;
  estimatedTotalTCO2e?: number;
  totalTCO2e: number;
  totalAmount: number;
  currency: string;
  treesCount: number;
};

/**
 * Result returned after successful atomic compensation creation.
 */
export type CreateCompensationAtomicResult = {
  compensationId: string;
  areaId: string;
  compensationMode: "tree_purchase";
  horizonYears?: number;
  treesRequested?: number;
  pricePerTree?: number;
  estimatedTotalTCO2e?: number;
  totalTCO2e: number;
  treesCount: number;
  status: "pending";
  createdAt: Date;
};

/**
 * Area stock snapshot locked during compensation creation.
 */
export type CompensationAreaSnapshot = {
  id: string;
  status: string;
  maxPurchasableTrees: number | null;
};

/**
 * Persistence record used when inserting a compensation row.
 */
export type CompensationCreateRecord = {
  id: string;
  supporterUserId: string;
  areaId: string;
  calculationId?: string;
  compensationMode: "tree_purchase";
  horizonYears?: number;
  treesRequested?: number;
  pricePerTree?: number;
  estimatedTotalTCO2e?: number;
  totalCO2Kg: number;
  totalTCO2e: number;
  treesCount: number;
  totalAmount: number;
  currency: string;
  status: "pending";
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Transaction boundary for compensation + area commitment updates.
 */
export interface CompensationAtomicTransaction {
  lockArea(areaId: string): Promise<CompensationAreaSnapshot | null>;
  insertCompensation(record: CompensationCreateRecord): Promise<void>;
  sumCommittedTreeCountByArea(areaId: string): Promise<number>;
}

/**
 * Port used by compensation use case to run atomic writes.
 */
export interface CompensationAtomicStore {
  runInTransaction<T>(
    work: (tx: CompensationAtomicTransaction) => Promise<T>,
  ): Promise<T>;
}

/**
 * Creates a pending tree-planting contribution within a single transaction.
 */
export async function createCompensationAtomic(
  deps: {
    store: CompensationAtomicStore;
    idGenerator: { generate(): string };
    clock: { now(): Date };
    auditLog: {
      log(entry: {
        actorUserId: string;
        action: string;
        entityType: string;
        entityId: string;
        metadata?: Record<string, any>;
      }): Promise<void>;
    };
    defaultMaxPurchasableTrees: number;
  },
  input: CreateCompensationAtomicInput,
): Promise<CreateCompensationAtomicResult> {
  validateInput(input);

  const now = deps.clock.now();
  const compensationId = deps.idGenerator.generate();
  const compensationMode = input.compensationMode ?? "tree_purchase";

  const result = await deps.store.runInTransaction(async (tx) => {
    const area = await tx.lockArea(input.areaId);
    if (!area) {
      throw new NotFoundError("area.not_found");
    }

    if (area.status !== "active") {
      throw new ValidationError([
        {
          field: "area_id",
          message: "area_not_active",
        },
      ]);
    }

    const effectiveMax =
      area.maxPurchasableTrees ?? deps.defaultMaxPurchasableTrees;
    const committedTreeCount = await tx.sumCommittedTreeCountByArea(area.id);
    const requestedTrees = input.treesCount;

    if (committedTreeCount + requestedTrees > effectiveMax) {
      throw new ValidationError([
        {
          field: "trees_count",
          message: `tree_limit_exceeded: max ${effectiveMax}, remaining ${effectiveMax - committedTreeCount}`,
        },
      ]);
    }

    await tx.insertCompensation({
      id: compensationId,
      supporterUserId: input.supporterUserId,
      areaId: area.id,
      calculationId: input.calculationId,
      compensationMode,
      horizonYears: input.horizonYears,
      treesRequested: input.treesRequested,
      pricePerTree: input.pricePerTree,
      estimatedTotalTCO2e: input.estimatedTotalTCO2e ?? input.totalTCO2e,
      totalCO2Kg: input.totalTCO2e * 1000,
      totalTCO2e: input.totalTCO2e,
      treesCount: input.treesCount,
      totalAmount: input.totalAmount,
      currency: input.currency,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return {
      compensationId,
      areaId: area.id,
      compensationMode,
      horizonYears: input.horizonYears,
      treesRequested: input.treesRequested,
      pricePerTree: input.pricePerTree,
      estimatedTotalTCO2e: input.estimatedTotalTCO2e ?? input.totalTCO2e,
      totalTCO2e: input.totalTCO2e,
      treesCount: input.treesCount,
      status: "pending" as const,
      createdAt: now,
    };
  });

  await deps.auditLog.log({
    actorUserId: input.supporterUserId,
    action: "compensation.created_pending",
    entityType: "compensation",
    entityId: result.compensationId,
    metadata: {
      area_id: result.areaId,
      compensation_mode: result.compensationMode,
      horizon_years: result.horizonYears,
      trees_requested: result.treesRequested,
      price_per_tree: result.pricePerTree,
      estimated_total_t_co2e: result.estimatedTotalTCO2e,
      total_t_co2e: result.totalTCO2e,
      trees_count: result.treesCount,
    },
  });

  return result;
}

/**
 * Validates business invariants for atomic compensation creation.
 */
function validateInput(input: CreateCompensationAtomicInput): void {
  const errors: Array<{ field: string; message: string }> = [];
  const mode = input.compensationMode ?? "tree_purchase";

  if (input.totalTCO2e <= 0) {
    errors.push({ field: "total_t_co2e", message: "must_be_positive" });
  }
  if (input.totalAmount <= 0) {
    errors.push({ field: "total_amount", message: "must_be_positive" });
  }
  if (input.treesCount <= 0) {
    errors.push({ field: "trees_count", message: "must_be_positive" });
  }
  if (!input.currency || input.currency.length !== 3) {
    errors.push({ field: "currency", message: "must_be_iso_4217" });
  }
  if (mode !== "tree_purchase") {
    errors.push({ field: "compensation_mode", message: "invalid_mode" });
  }
  if (!input.horizonYears || input.horizonYears <= 0) {
    errors.push({ field: "horizon_years", message: "must_be_positive" });
  }
  if (!input.treesRequested || input.treesRequested <= 0) {
    errors.push({ field: "trees_requested", message: "must_be_positive" });
  }
  if (!input.pricePerTree || input.pricePerTree <= 0) {
    errors.push({ field: "price_per_tree", message: "must_be_positive" });
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}
