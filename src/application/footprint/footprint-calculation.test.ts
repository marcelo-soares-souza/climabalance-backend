import { describe, expect, it } from "bun:test";
import type { FootprintCalculation } from "../../domain/footprint/entities/footprint-calculation";
import type { FootprintInput } from "../../domain/footprint/entities/footprint-input";
import type { FootprintBreakdown } from "../../domain/footprint/entities/footprint-breakdown";
import type { EmissionFactor } from "../../domain/footprint/entities/emission-factor";
import type { CompensationProjection } from "../../domain/footprint/entities/compensation-projection";
import type {
  FootprintCalculationRepository,
  FootprintCalculationWithUser,
} from "../../domain/footprint/repositories/footprint-calculation-repository";
import type { FootprintInputRepository } from "../../domain/footprint/repositories/footprint-input-repository";
import type { FootprintBreakdownRepository } from "../../domain/footprint/repositories/footprint-breakdown-repository";
import type { EmissionFactorRepository } from "../../domain/footprint/repositories/emission-factor-repository";
import type { CompensationProjectionRepository } from "../../domain/footprint/repositories/compensation-projection-repository";
import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogRepository,
} from "../../domain/audit/audit-log-repository";
import type { UnitOfWork } from "../../infrastructure/persistence/unit-of-work";
import { ValidationError } from "../../domain/errors";
import { createFootprintCalculation } from "./create-footprint-calculation";
import { updateFootprintCalculation } from "./update-footprint-calculation";
import { finalizeFootprintCalculation } from "./finalize-footprint-calculation";
import { deleteFootprintCalculation } from "./delete-footprint-calculation";
import { listFootprintCalculations } from "./list-footprint-calculations";
import { getFootprintCalculation } from "./get-footprint-calculation";

class MemoryFootprintCalculationRepository implements FootprintCalculationRepository {
  items: FootprintCalculationWithUser[] = [];

  async save(calculation: FootprintCalculation): Promise<void> {
    this.items.push({ ...calculation });
  }

  async update(calculation: FootprintCalculation): Promise<void> {
    const index = this.items.findIndex((c) => c.id === calculation.id);
    if (index >= 0) {
      this.items[index] = { ...calculation };
    }
  }

  async findById(id: string): Promise<FootprintCalculation | null> {
    return this.items.find((c) => c.id === id) ?? null;
  }

  async findByUserId(
    userId: string,
    filters?: {
      status?: FootprintCalculation["status"];
      profile_type?: FootprintCalculation["profile_type"];
      limit?: number;
      offset?: number;
    },
  ): Promise<FootprintCalculationWithUser[]> {
    let results = this.items.filter(
      (c) => c.user_id === userId && !c.deleted_at,
    );
    if (filters?.status) {
      results = results.filter((c) => c.status === filters.status);
    }
    if (filters?.profile_type) {
      results = results.filter((c) => c.profile_type === filters.profile_type);
    }
    return results;
  }

  async findAll(filters?: {
    status?: FootprintCalculation["status"];
    profile_type?: FootprintCalculation["profile_type"];
    user_email?: string;
    limit?: number;
    offset?: number;
  }): Promise<FootprintCalculationWithUser[]> {
    let results = this.items.filter((c) => !c.deleted_at);
    if (filters?.status) {
      results = results.filter((c) => c.status === filters.status);
    }
    if (filters?.profile_type) {
      results = results.filter((c) => c.profile_type === filters.profile_type);
    }
    if (filters?.user_email) {
      const needle = filters.user_email.toLowerCase();
      results = results.filter((c) =>
        (c.user_email ?? "").toLowerCase().includes(needle),
      );
    }
    return results;
  }

  async findByIdWithUser(
    id: string,
  ): Promise<FootprintCalculationWithUser | null> {
    return (await this.findById(id)) as FootprintCalculationWithUser | null;
  }

  async delete(id: string): Promise<void> {
    const item = this.items.find((c) => c.id === id);
    if (item) {
      item.deleted_at = new Date();
      item.updated_at = new Date();
    }
  }
}

class MemoryFootprintInputRepository implements FootprintInputRepository {
  items: FootprintInput[] = [];

  async save(input: FootprintInput): Promise<void> {
    this.items.push({ ...input });
  }

  async saveMany(inputs: FootprintInput[]): Promise<void> {
    this.items.push(...inputs.map((i) => ({ ...i })));
  }

  async findByCalculationId(calculationId: string): Promise<FootprintInput[]> {
    return this.items.filter(
      (i) => i.calculation_id === calculationId && !i.deleted_at,
    );
  }

  async deleteByCalculationId(calculationId: string): Promise<void> {
    for (const item of this.items) {
      if (item.calculation_id === calculationId) {
        item.deleted_at = new Date();
        item.updated_at = new Date();
      }
    }
  }
}

class MemoryFootprintBreakdownRepository implements FootprintBreakdownRepository {
  items: FootprintBreakdown[] = [];

  async save(breakdown: FootprintBreakdown): Promise<void> {
    this.items.push({ ...breakdown });
  }

  async saveMany(breakdowns: FootprintBreakdown[]): Promise<void> {
    this.items.push(...breakdowns.map((b) => ({ ...b })));
  }

  async findByCalculationId(
    calculationId: string,
  ): Promise<FootprintBreakdown[]> {
    return this.items.filter(
      (b) => b.calculation_id === calculationId && !b.deleted_at,
    );
  }

  async deleteByCalculationId(calculationId: string): Promise<void> {
    for (const item of this.items) {
      if (item.calculation_id === calculationId) {
        item.deleted_at = new Date();
        item.updated_at = new Date();
      }
    }
  }
}

class MemoryEmissionFactorRepository implements EmissionFactorRepository {
  constructor(private factors: EmissionFactor[]) {}

  async findByVersionAndRegion(
    version: string,
    region: string,
  ): Promise<EmissionFactor[]> {
    return this.factors.filter(
      (f) => f.version === version && f.region === region && !f.deleted_at,
    );
  }

  async findByCategory(
    category: string,
    version: string,
    region: string,
  ): Promise<EmissionFactor[]> {
    const prefix = category === "flights" ? "flight" : category;
    if (
      category === "scope1" ||
      category === "scope2" ||
      category === "scope3"
    ) {
      return this.factors.filter(
        (f) => f.version === version && f.region === region && !f.deleted_at,
      );
    }
    return this.factors.filter(
      (f) =>
        f.version === version &&
        f.region === region &&
        f.activity_type.startsWith(prefix) &&
        !f.deleted_at,
    );
  }

  async findByActivityType(
    activityType: string,
    unit: string,
    version: string,
    region: string,
  ): Promise<EmissionFactor | null> {
    return (
      this.factors.find(
        (f) =>
          f.activity_type === activityType &&
          f.unit === unit &&
          f.version === version &&
          f.region === region &&
          !f.deleted_at,
      ) ?? null
    );
  }

  async getLatestVersion(region: string): Promise<string | null> {
    return this.factors.find((f) => f.region === region)?.version ?? null;
  }
}

class MemoryCompensationProjectionRepository implements CompensationProjectionRepository {
  items: CompensationProjection[] = [];

  async save(projection: CompensationProjection): Promise<void> {
    this.items.push({ ...projection });
  }

  async findByCalculationId(
    calculationId: string,
  ): Promise<CompensationProjection | null> {
    return (
      this.items.find(
        (p) => p.calculation_id === calculationId && !p.deleted_at,
      ) ?? null
    );
  }

  async findByAreaId(areaId: string): Promise<CompensationProjection[]> {
    return this.items.filter((p) => p.area_id === areaId && !p.deleted_at);
  }
}

class MemoryAuditLogRepository implements AuditLogRepository {
  entries: AuditLogEntry[] = [];

  async create(entry: AuditLogEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async list(_filters: AuditLogFilters): Promise<AuditLogEntry[]> {
    return this.entries;
  }

  async log(): Promise<void> {
    // no-op for tests
  }

  async verifyChain(): Promise<{
    valid: boolean;
    totalEntries: number;
    verifiedEntries: number;
    firstBrokenEntry?: string;
  }> {
    return {
      valid: true,
      totalEntries: this.entries.length,
      verifiedEntries: this.entries.length,
    };
  }

  async archive(): Promise<{ archived: number; deleted: number }> {
    return { archived: 0, deleted: 0 };
  }

  async listWithTotal(): Promise<{ entries: AuditLogEntry[]; total: number }> {
    return { entries: this.entries, total: this.entries.length };
  }
}

class MemoryUnitOfWork implements UnitOfWork {
  constructor(
    private deps: {
      calculationRepository: FootprintCalculationRepository;
      inputRepository: FootprintInputRepository;
      breakdownRepository: FootprintBreakdownRepository;
      projectionRepository: CompensationProjectionRepository;
      auditLogRepository: AuditLogRepository;
    },
  ) {}

  async execute<T>(work: (tx: any) => Promise<T>): Promise<T> {
    const tx = {
      getUserRepository: () => ({}),
      getEmailConfirmationRepository: () => ({}),
      getPasswordResetRepository: () => ({}),
      getAuditLogRepository: () => this.deps.auditLogRepository,
      getFootprintCalculationRepository: () => this.deps.calculationRepository,
      getFootprintInputRepository: () => this.deps.inputRepository,
      getFootprintBreakdownRepository: () => this.deps.breakdownRepository,
      getCompensationProjectionRepository: () => this.deps.projectionRepository,
    };
    return work(tx);
  }
}

let idCounter = 0;
const idGenerator = {
  generate: () => `test-id-${++idCounter}`,
};

const clock = {
  now: () => new Date("2026-01-31T12:00:00Z"),
};

describe("footprint calculations", () => {
  it("creates calculation, inputs and breakdown", async () => {
    const factors: EmissionFactor[] = [
      {
        id: "factor-1",
        activity_type: "energy_residential",
        unit: "kwh",
        factor_value: 0.1,
        factor_unit: "kg_co2e",
        source: "test",
        valid_from: null,
        valid_to: null,
        region: "BR",
        version: "2026-01",
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
      {
        id: "factor-2",
        activity_type: "fuel_gasoline",
        unit: "liter",
        factor_value: 2,
        factor_unit: "kg_co2e",
        source: "test",
        valid_from: null,
        valid_to: null,
        region: "BR",
        version: "2026-01",
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();
    const projectionRepository = new MemoryCompensationProjectionRepository();
    const auditLogRepository = new MemoryAuditLogRepository();
    const unitOfWork = new MemoryUnitOfWork({
      calculationRepository,
      inputRepository,
      breakdownRepository,
      projectionRepository,
      auditLogRepository,
    });

    const result = await createFootprintCalculation(
      {
        emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
        unitOfWork,
        idGenerator,
        clock,
      },
      {
        user_id: "user-1",
        profile_type: "individual",
        period_start: "2026-01-01",
        period_end: "2026-02-01",
        inputs: [
          { category: "energy", unit: "kwh", value: 100 },
          {
            category: "fuel",
            unit: "liter",
            value: 10,
            metadata: { fuel_type: "gasoline" },
          },
        ],
      },
    );

    expect(result.total_kg_co2e).toBeCloseTo(30, 6);
    expect(result.total_t_co2e).toBeCloseTo(0.03, 6);
    expect(result.breakdown.length).toBe(2);

    expect(calculationRepository.items.length).toBe(1);
    expect(inputRepository.items.length).toBe(2);
    expect(breakdownRepository.items.length).toBe(2);
    expect(calculationRepository.items[0]?.status).toBe("draft");
  });

  it("returns ValidationError for missing metadata", async () => {
    const factors: EmissionFactor[] = [
      {
        id: "factor-1",
        activity_type: "fuel_gasoline",
        unit: "liter",
        factor_value: 2,
        factor_unit: "kg_co2e",
        source: "test",
        valid_from: null,
        valid_to: null,
        region: "BR",
        version: "2026-01",
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();
    const projectionRepository = new MemoryCompensationProjectionRepository();
    const auditLogRepository = new MemoryAuditLogRepository();
    const unitOfWork = new MemoryUnitOfWork({
      calculationRepository,
      inputRepository,
      breakdownRepository,
      projectionRepository,
      auditLogRepository,
    });

    let error: unknown = null;
    try {
      await createFootprintCalculation(
        {
          emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
          unitOfWork,
          idGenerator,
          clock,
        },
        {
          user_id: "user-1",
          profile_type: "individual",
          period_start: "2026-01-01",
          period_end: "2026-02-01",
          inputs: [{ category: "fuel", unit: "liter", value: 10 }],
        },
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    if (error instanceof ValidationError) {
      expect(error.fieldErrors[0]?.field).toBe("inputs");
    }
  });

  it("finalizes calculation and writes audit log", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();
    const projectionRepository = new MemoryCompensationProjectionRepository();
    const auditLogRepository = new MemoryAuditLogRepository();
    const unitOfWork = new MemoryUnitOfWork({
      calculationRepository,
      inputRepository,
      breakdownRepository,
      projectionRepository,
      auditLogRepository,
    });

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-1",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 30,
      total_t_co2e: 0.03,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "draft",
      finalized_at: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
      deleted_at: null,
    };
    await calculationRepository.save(calculation);

    await finalizeFootprintCalculation(
      {
        calculationRepository,
        unitOfWork,
        idGenerator,
        clock,
      },
      "calc-1",
      "user-1",
    );

    const updated = await calculationRepository.findById("calc-1");
    expect(updated?.status).toBe("finalized");
    expect(auditLogRepository.entries.length).toBe(1);
    expect(auditLogRepository.entries[0]?.action).toBe(
      "footprint_calculation.finalized",
    );
  });

  it("lists only own calculations when not admin", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();

    const baseCalculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-1",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "draft",
      finalized_at: null,
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(baseCalculation);
    await calculationRepository.save({
      ...baseCalculation,
      id: "calc-2",
      user_id: "user-2",
    });

    const result = await listFootprintCalculations(
      { calculationRepository },
      { user_id: "user-1" },
    );

    expect(result.calculations.length).toBe(1);
    expect(result.calculations[0]?.id).toBe("calc-1");
  });

  it("allows admin to list all calculations and filter by email", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();

    const calc1: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-1",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "draft",
      finalized_at: null,
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
      deleted_at: null,
    };

    const calc2: FootprintCalculation = {
      ...calc1,
      id: "calc-2",
      user_id: "user-2",
    };

    await calculationRepository.save(calc1);
    await calculationRepository.save(calc2);
    calculationRepository.items[0]!.user_email = "user1@example.com";
    calculationRepository.items[1]!.user_email = "user2@example.com";
    calculationRepository.items[1]!.user_name = "User Two";

    const allResult = await listFootprintCalculations(
      { calculationRepository },
      { user_id: "admin-1", is_admin: true },
    );

    expect(allResult.calculations.length).toBe(2);

    const filteredResult = await listFootprintCalculations(
      { calculationRepository },
      { user_id: "admin-1", is_admin: true, user_email: "user2@example.com" },
    );

    expect(filteredResult.calculations.length).toBe(1);
    expect(filteredResult.calculations[0]?.user_email).toBe(
      "user2@example.com",
    );
    expect(filteredResult.calculations[0]?.user_name).toBe("User Two");
  });

  it("allows admin to view calculation detail for other users", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-2",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "draft",
      finalized_at: null,
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);
    calculationRepository.items[0]!.user_email = "user2@example.com";

    const result = await getFootprintCalculation(
      {
        calculationRepository,
        inputRepository,
        breakdownRepository,
      },
      "calc-1",
      "admin-1",
      { is_admin: true },
    );

    expect(result.user_id).toBe("user-2");
    expect(result.user_email).toBe("user2@example.com");
  });

  it("allows admin to update calculations owned by other users", async () => {
    const factors: EmissionFactor[] = [
      {
        id: "factor-1",
        activity_type: "energy_residential",
        unit: "kwh",
        factor_value: 0.1,
        factor_unit: "kg_co2e",
        source: "test",
        valid_from: null,
        valid_to: null,
        region: "BR",
        version: "2026-01",
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();
    const projectionRepository = new MemoryCompensationProjectionRepository();
    const auditLogRepository = new MemoryAuditLogRepository();
    const unitOfWork = new MemoryUnitOfWork({
      calculationRepository,
      inputRepository,
      breakdownRepository,
      projectionRepository,
      auditLogRepository,
    });

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-2",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "draft",
      finalized_at: null,
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);

    // Admin should be able to update other user's calculation
    await updateFootprintCalculation(
      {
        calculationRepository,
        emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
        unitOfWork,
        idGenerator,
        clock,
      },
      {
        calculation_id: "calc-1",
        user_id: "admin-1",
        isAdmin: true,
        inputs: [{ category: "energy", unit: "kwh", value: 200 }],
      },
    );

    const updated = await calculationRepository.findById("calc-1");
    expect(updated?.total_kg_co2e).toBeCloseTo(20, 6);
    expect(updated?.user_id).toBe("user-2");
  });

  it("allows admin to update finalized calculations", async () => {
    const factors: EmissionFactor[] = [
      {
        id: "factor-1",
        activity_type: "energy_residential",
        unit: "kwh",
        factor_value: 0.1,
        factor_unit: "kg_co2e",
        source: "test",
        valid_from: null,
        valid_to: null,
        region: "BR",
        version: "2026-01",
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();
    const projectionRepository = new MemoryCompensationProjectionRepository();
    const auditLogRepository = new MemoryAuditLogRepository();
    const unitOfWork = new MemoryUnitOfWork({
      calculationRepository,
      inputRepository,
      breakdownRepository,
      projectionRepository,
      auditLogRepository,
    });

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-1",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "finalized",
      finalized_at: new Date("2026-01-03T00:00:00Z"),
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-03T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);

    // Admin should be able to update finalized calculation
    await updateFootprintCalculation(
      {
        calculationRepository,
        emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
        unitOfWork,
        idGenerator,
        clock,
      },
      {
        calculation_id: "calc-1",
        user_id: "admin-1",
        isAdmin: true,
        inputs: [{ category: "energy", unit: "kwh", value: 300 }],
      },
    );

    const updated = await calculationRepository.findById("calc-1");
    expect(updated?.total_kg_co2e).toBeCloseTo(30, 6);
    expect(updated?.status).toBe("finalized");
  });

  it("allows admin to delete calculations owned by other users", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-2",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "draft",
      finalized_at: null,
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);

    // Admin should be able to delete other user's calculation
    await deleteFootprintCalculation(
      { calculationRepository },
      "calc-1",
      "admin-1",
      true,
    );

    const deleted = await calculationRepository.findById("calc-1");
    expect(deleted?.deleted_at).not.toBeNull();
  });

  it("allows admin to delete finalized calculations", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-1",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "finalized",
      finalized_at: new Date("2026-01-03T00:00:00Z"),
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-03T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);

    // Admin should be able to delete finalized calculation
    await deleteFootprintCalculation(
      { calculationRepository },
      "calc-1",
      "admin-1",
      true,
    );

    const deleted = await calculationRepository.findById("calc-1");
    expect(deleted?.deleted_at).not.toBeNull();
  });

  it("allows admin to finalize calculations owned by other users", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();
    const projectionRepository = new MemoryCompensationProjectionRepository();
    const auditLogRepository = new MemoryAuditLogRepository();
    const unitOfWork = new MemoryUnitOfWork({
      calculationRepository,
      inputRepository,
      breakdownRepository,
      projectionRepository,
      auditLogRepository,
    });

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-2",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "draft",
      finalized_at: null,
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);

    // Admin should be able to finalize other user's calculation
    await finalizeFootprintCalculation(
      {
        calculationRepository,
        unitOfWork,
        idGenerator,
        clock,
      },
      "calc-1",
      "admin-1",
      true,
    );

    const finalized = await calculationRepository.findById("calc-1");
    expect(finalized?.status).toBe("finalized");
    expect(finalized?.finalized_at).not.toBeNull();
    expect(finalized?.user_id).toBe("user-2");
  });

  it("prevents non-admin from updating finalized calculations", async () => {
    const factors: EmissionFactor[] = [
      {
        id: "factor-1",
        activity_type: "energy_residential",
        unit: "kwh",
        factor_value: 0.1,
        factor_unit: "kg_co2e",
        source: "test",
        valid_from: null,
        valid_to: null,
        region: "BR",
        version: "2026-01",
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    const calculationRepository = new MemoryFootprintCalculationRepository();
    const inputRepository = new MemoryFootprintInputRepository();
    const breakdownRepository = new MemoryFootprintBreakdownRepository();
    const projectionRepository = new MemoryCompensationProjectionRepository();
    const auditLogRepository = new MemoryAuditLogRepository();
    const unitOfWork = new MemoryUnitOfWork({
      calculationRepository,
      inputRepository,
      breakdownRepository,
      projectionRepository,
      auditLogRepository,
    });

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-1",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "finalized",
      finalized_at: new Date("2026-01-03T00:00:00Z"),
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-03T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);

    let error: unknown = null;
    try {
      await updateFootprintCalculation(
        {
          calculationRepository,
          emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
          unitOfWork,
          idGenerator,
          clock,
        },
        {
          calculation_id: "calc-1",
          user_id: "user-1",
          isAdmin: false,
          inputs: [{ category: "energy", unit: "kwh", value: 200 }],
        },
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
  });

  it("prevents non-admin from deleting finalized calculations", async () => {
    const calculationRepository = new MemoryFootprintCalculationRepository();

    const calculation: FootprintCalculation = {
      id: "calc-1",
      user_id: "user-1",
      profile_type: "individual",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-02-01"),
      total_kg_co2e: 10,
      total_t_co2e: 0.01,
      unit: "kg",
      calculation_method: "activity_based",
      data_quality: "estimated",
      factors_version: "2026-01",
      status: "finalized",
      finalized_at: new Date("2026-01-03T00:00:00Z"),
      created_at: new Date("2026-01-02T00:00:00Z"),
      updated_at: new Date("2026-01-03T00:00:00Z"),
      deleted_at: null,
    };

    await calculationRepository.save(calculation);

    let error: unknown = null;
    try {
      await deleteFootprintCalculation(
        { calculationRepository },
        "calc-1",
        "user-1",
        false,
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
  });
});
