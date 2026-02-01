import { describe, expect, it } from 'bun:test';
import type { FootprintCalculation } from '../../domain/footprint/entities/footprint-calculation';
import type { FootprintInput } from '../../domain/footprint/entities/footprint-input';
import type { FootprintBreakdown } from '../../domain/footprint/entities/footprint-breakdown';
import type { EmissionFactor } from '../../domain/footprint/entities/emission-factor';
import type { CompensationProjection } from '../../domain/footprint/entities/compensation-projection';
import type { FootprintCalculationRepository } from '../../domain/footprint/repositories/footprint-calculation-repository';
import type { FootprintInputRepository } from '../../domain/footprint/repositories/footprint-input-repository';
import type { FootprintBreakdownRepository } from '../../domain/footprint/repositories/footprint-breakdown-repository';
import type { EmissionFactorRepository } from '../../domain/footprint/repositories/emission-factor-repository';
import type { CompensationProjectionRepository } from '../../domain/footprint/repositories/compensation-projection-repository';
import type { AuditLogEntry, AuditLogFilters, AuditLogRepository } from '../../domain/audit/audit-log-repository';
import type { UnitOfWork } from '../../infrastructure/persistence/unit-of-work';
import { ValidationError } from '../../domain/errors';
import { createFootprintCalculation } from './create-footprint-calculation';
import { finalizeFootprintCalculation } from './finalize-footprint-calculation';

class MemoryFootprintCalculationRepository implements FootprintCalculationRepository {
  items: FootprintCalculation[] = [];

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
    filters?: { status?: FootprintCalculation['status']; profile_type?: FootprintCalculation['profile_type']; limit?: number; offset?: number; }
  ): Promise<FootprintCalculation[]> {
    const results = this.items.filter((c) => c.user_id === userId && !c.deleted_at);
    if (filters?.status) {
      return results.filter((c) => c.status === filters.status);
    }
    return results;
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
    return this.items.filter((i) => i.calculation_id === calculationId && !i.deleted_at);
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

  async findByCalculationId(calculationId: string): Promise<FootprintBreakdown[]> {
    return this.items.filter((b) => b.calculation_id === calculationId && !b.deleted_at);
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

  async findByVersionAndRegion(version: string, region: string): Promise<EmissionFactor[]> {
    return this.factors.filter((f) => f.version === version && f.region === region && !f.deleted_at);
  }

  async findByCategory(category: string, version: string, region: string): Promise<EmissionFactor[]> {
    const prefix = category === 'flights' ? 'flight' : category;
    if (category === 'scope1' || category === 'scope2' || category === 'scope3') {
      return this.factors.filter((f) => f.version === version && f.region === region && !f.deleted_at);
    }
    return this.factors.filter(
      (f) =>
        f.version === version &&
        f.region === region &&
        f.activity_type.startsWith(prefix) &&
        !f.deleted_at
    );
  }

  async findByActivityType(activityType: string, unit: string, version: string, region: string): Promise<EmissionFactor | null> {
    return (
      this.factors.find(
        (f) =>
          f.activity_type === activityType &&
          f.unit === unit &&
          f.version === version &&
          f.region === region &&
          !f.deleted_at
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

  async findByCalculationId(calculationId: string): Promise<CompensationProjection | null> {
    return this.items.find((p) => p.calculation_id === calculationId && !p.deleted_at) ?? null;
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
}

class MemoryUnitOfWork implements UnitOfWork {
  constructor(
    private deps: {
      calculationRepository: FootprintCalculationRepository;
      inputRepository: FootprintInputRepository;
      breakdownRepository: FootprintBreakdownRepository;
      projectionRepository: CompensationProjectionRepository;
      auditLogRepository: AuditLogRepository;
    }
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
      getCompensationProjectionRepository: () => this.deps.projectionRepository
    };
    return work(tx);
  }
}

let idCounter = 0;
const idGenerator = {
  generate: () => `test-id-${++idCounter}`
};

const clock = {
  now: () => new Date('2026-01-31T12:00:00Z')
};

describe('footprint calculations', () => {
  it('creates calculation, inputs and breakdown', async () => {
    const factors: EmissionFactor[] = [
      {
        id: 'factor-1',
        activity_type: 'energy_residential',
        unit: 'kwh',
        factor_value: 0.1,
        factor_unit: 'kg_co2e',
        source: 'test',
        valid_from: null,
        valid_to: null,
        region: 'BR',
        version: '2026-01',
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      },
      {
        id: 'factor-2',
        activity_type: 'fuel_gasoline',
        unit: 'liter',
        factor_value: 2,
        factor_unit: 'kg_co2e',
        source: 'test',
        valid_from: null,
        valid_to: null,
        region: 'BR',
        version: '2026-01',
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      }
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
      auditLogRepository
    });

    const result = await createFootprintCalculation(
      {
        emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
        unitOfWork,
        idGenerator,
        clock
      },
      {
        user_id: 'user-1',
        profile_type: 'individual',
        period_start: '2026-01-01',
        period_end: '2026-02-01',
        inputs: [
          { category: 'energy', unit: 'kwh', value: 100 },
          { category: 'fuel', unit: 'liter', value: 10, metadata: { fuel_type: 'gasoline' } }
        ]
      }
    );

    expect(result.total_kg_co2e).toBeCloseTo(30, 6);
    expect(result.total_t_co2e).toBeCloseTo(0.03, 6);
    expect(result.breakdown.length).toBe(2);

    expect(calculationRepository.items.length).toBe(1);
    expect(inputRepository.items.length).toBe(2);
    expect(breakdownRepository.items.length).toBe(2);
    expect(calculationRepository.items[0]?.status).toBe('draft');
  });

  it('returns ValidationError for missing metadata', async () => {
    const factors: EmissionFactor[] = [
      {
        id: 'factor-1',
        activity_type: 'fuel_gasoline',
        unit: 'liter',
        factor_value: 2,
        factor_unit: 'kg_co2e',
        source: 'test',
        valid_from: null,
        valid_to: null,
        region: 'BR',
        version: '2026-01',
        metadata_json: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      }
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
      auditLogRepository
    });

    let error: unknown = null;
    try {
      await createFootprintCalculation(
        {
          emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
          unitOfWork,
          idGenerator,
          clock
        },
        {
          user_id: 'user-1',
          profile_type: 'individual',
          period_start: '2026-01-01',
          period_end: '2026-02-01',
          inputs: [
            { category: 'fuel', unit: 'liter', value: 10 }
          ]
        }
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    if (error instanceof ValidationError) {
      expect(error.fieldErrors[0]?.field).toBe('inputs');
    }
  });

  it('finalizes calculation and writes audit log', async () => {
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
      auditLogRepository
    });

    const calculation: FootprintCalculation = {
      id: 'calc-1',
      user_id: 'user-1',
      profile_type: 'individual',
      period_start: new Date('2026-01-01'),
      period_end: new Date('2026-02-01'),
      total_kg_co2e: 30,
      total_t_co2e: 0.03,
      unit: 'kg',
      calculation_method: 'activity_based',
      data_quality: 'estimated',
      factors_version: '2026-01',
      status: 'draft',
      finalized_at: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      deleted_at: null
    };
    await calculationRepository.save(calculation);

    await finalizeFootprintCalculation(
      {
        calculationRepository,
        unitOfWork,
        idGenerator,
        clock
      },
      'calc-1',
      'user-1'
    );

    const updated = await calculationRepository.findById('calc-1');
    expect(updated?.status).toBe('finalized');
    expect(auditLogRepository.entries.length).toBe(1);
    expect(auditLogRepository.entries[0]?.action).toBe('footprint_calculation.finalized');
  });
});
