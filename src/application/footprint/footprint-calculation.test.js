import { describe, expect, it } from 'bun:test';
import { ValidationError } from '../../domain/errors';
import { createFootprintCalculation } from './create-footprint-calculation';
import { finalizeFootprintCalculation } from './finalize-footprint-calculation';
import { listFootprintCalculations } from './list-footprint-calculations';
import { getFootprintCalculation } from './get-footprint-calculation';
class MemoryFootprintCalculationRepository {
    items = [];
    async save(calculation) {
        this.items.push({ ...calculation });
    }
    async update(calculation) {
        const index = this.items.findIndex((c) => c.id === calculation.id);
        if (index >= 0) {
            this.items[index] = { ...calculation };
        }
    }
    async findById(id) {
        return this.items.find((c) => c.id === id) ?? null;
    }
    async findByUserId(userId, filters) {
        let results = this.items.filter((c) => c.user_id === userId && !c.deleted_at);
        if (filters?.status) {
            results = results.filter((c) => c.status === filters.status);
        }
        if (filters?.profile_type) {
            results = results.filter((c) => c.profile_type === filters.profile_type);
        }
        return results;
    }
    async findAll(filters) {
        let results = this.items.filter((c) => !c.deleted_at);
        if (filters?.status) {
            results = results.filter((c) => c.status === filters.status);
        }
        if (filters?.profile_type) {
            results = results.filter((c) => c.profile_type === filters.profile_type);
        }
        if (filters?.user_email) {
            const needle = filters.user_email.toLowerCase();
            results = results.filter((c) => (c.user_email ?? '').toLowerCase().includes(needle));
        }
        return results;
    }
    async findByIdWithUser(id) {
        return (await this.findById(id));
    }
    async delete(id) {
        const item = this.items.find((c) => c.id === id);
        if (item) {
            item.deleted_at = new Date();
            item.updated_at = new Date();
        }
    }
}
class MemoryFootprintInputRepository {
    items = [];
    async save(input) {
        this.items.push({ ...input });
    }
    async saveMany(inputs) {
        this.items.push(...inputs.map((i) => ({ ...i })));
    }
    async findByCalculationId(calculationId) {
        return this.items.filter((i) => i.calculation_id === calculationId && !i.deleted_at);
    }
    async deleteByCalculationId(calculationId) {
        for (const item of this.items) {
            if (item.calculation_id === calculationId) {
                item.deleted_at = new Date();
                item.updated_at = new Date();
            }
        }
    }
}
class MemoryFootprintBreakdownRepository {
    items = [];
    async save(breakdown) {
        this.items.push({ ...breakdown });
    }
    async saveMany(breakdowns) {
        this.items.push(...breakdowns.map((b) => ({ ...b })));
    }
    async findByCalculationId(calculationId) {
        return this.items.filter((b) => b.calculation_id === calculationId && !b.deleted_at);
    }
    async deleteByCalculationId(calculationId) {
        for (const item of this.items) {
            if (item.calculation_id === calculationId) {
                item.deleted_at = new Date();
                item.updated_at = new Date();
            }
        }
    }
}
class MemoryEmissionFactorRepository {
    factors;
    constructor(factors) {
        this.factors = factors;
    }
    async findByVersionAndRegion(version, region) {
        return this.factors.filter((f) => f.version === version && f.region === region && !f.deleted_at);
    }
    async findByCategory(category, version, region) {
        const prefix = category === 'flights' ? 'flight' : category;
        if (category === 'scope1' || category === 'scope2' || category === 'scope3') {
            return this.factors.filter((f) => f.version === version && f.region === region && !f.deleted_at);
        }
        return this.factors.filter((f) => f.version === version &&
            f.region === region &&
            f.activity_type.startsWith(prefix) &&
            !f.deleted_at);
    }
    async findByActivityType(activityType, unit, version, region) {
        return (this.factors.find((f) => f.activity_type === activityType &&
            f.unit === unit &&
            f.version === version &&
            f.region === region &&
            !f.deleted_at) ?? null);
    }
    async getLatestVersion(region) {
        return this.factors.find((f) => f.region === region)?.version ?? null;
    }
}
class MemoryCompensationProjectionRepository {
    items = [];
    async save(projection) {
        this.items.push({ ...projection });
    }
    async findByCalculationId(calculationId) {
        return this.items.find((p) => p.calculation_id === calculationId && !p.deleted_at) ?? null;
    }
    async findByAreaId(areaId) {
        return this.items.filter((p) => p.area_id === areaId && !p.deleted_at);
    }
}
class MemoryAuditLogRepository {
    entries = [];
    async create(entry) {
        this.entries.push({ ...entry });
    }
    async list(_filters) {
        return this.entries;
    }
}
class MemoryUnitOfWork {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async execute(work) {
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
        const factors = [
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
        const result = await createFootprintCalculation({
            emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
            unitOfWork,
            idGenerator,
            clock
        }, {
            user_id: 'user-1',
            profile_type: 'individual',
            period_start: '2026-01-01',
            period_end: '2026-02-01',
            inputs: [
                { category: 'energy', unit: 'kwh', value: 100 },
                { category: 'fuel', unit: 'liter', value: 10, metadata: { fuel_type: 'gasoline' } }
            ]
        });
        expect(result.total_kg_co2e).toBeCloseTo(30, 6);
        expect(result.total_t_co2e).toBeCloseTo(0.03, 6);
        expect(result.breakdown.length).toBe(2);
        expect(calculationRepository.items.length).toBe(1);
        expect(inputRepository.items.length).toBe(2);
        expect(breakdownRepository.items.length).toBe(2);
        expect(calculationRepository.items[0]?.status).toBe('draft');
    });
    it('returns ValidationError for missing metadata', async () => {
        const factors = [
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
        let error = null;
        try {
            await createFootprintCalculation({
                emissionFactorRepository: new MemoryEmissionFactorRepository(factors),
                unitOfWork,
                idGenerator,
                clock
            }, {
                user_id: 'user-1',
                profile_type: 'individual',
                period_start: '2026-01-01',
                period_end: '2026-02-01',
                inputs: [
                    { category: 'fuel', unit: 'liter', value: 10 }
                ]
            });
        }
        catch (err) {
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
        const calculation = {
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
        await finalizeFootprintCalculation({
            calculationRepository,
            unitOfWork,
            idGenerator,
            clock
        }, 'calc-1', 'user-1');
        const updated = await calculationRepository.findById('calc-1');
        expect(updated?.status).toBe('finalized');
        expect(auditLogRepository.entries.length).toBe(1);
        expect(auditLogRepository.entries[0]?.action).toBe('footprint_calculation.finalized');
    });
    it('lists only own calculations when not admin', async () => {
        const calculationRepository = new MemoryFootprintCalculationRepository();
        const baseCalculation = {
            id: 'calc-1',
            user_id: 'user-1',
            profile_type: 'individual',
            period_start: new Date('2026-01-01'),
            period_end: new Date('2026-02-01'),
            total_kg_co2e: 10,
            total_t_co2e: 0.01,
            unit: 'kg',
            calculation_method: 'activity_based',
            data_quality: 'estimated',
            factors_version: '2026-01',
            status: 'draft',
            finalized_at: null,
            created_at: new Date('2026-01-02T00:00:00Z'),
            updated_at: new Date('2026-01-02T00:00:00Z'),
            deleted_at: null
        };
        await calculationRepository.save(baseCalculation);
        await calculationRepository.save({
            ...baseCalculation,
            id: 'calc-2',
            user_id: 'user-2'
        });
        const result = await listFootprintCalculations({ calculationRepository }, { user_id: 'user-1' });
        expect(result.calculations.length).toBe(1);
        expect(result.calculations[0]?.id).toBe('calc-1');
    });
    it('allows admin to list all calculations and filter by email', async () => {
        const calculationRepository = new MemoryFootprintCalculationRepository();
        const calc1 = {
            id: 'calc-1',
            user_id: 'user-1',
            profile_type: 'individual',
            period_start: new Date('2026-01-01'),
            period_end: new Date('2026-02-01'),
            total_kg_co2e: 10,
            total_t_co2e: 0.01,
            unit: 'kg',
            calculation_method: 'activity_based',
            data_quality: 'estimated',
            factors_version: '2026-01',
            status: 'draft',
            finalized_at: null,
            created_at: new Date('2026-01-02T00:00:00Z'),
            updated_at: new Date('2026-01-02T00:00:00Z'),
            deleted_at: null
        };
        const calc2 = {
            ...calc1,
            id: 'calc-2',
            user_id: 'user-2'
        };
        await calculationRepository.save(calc1);
        await calculationRepository.save(calc2);
        calculationRepository.items[0].user_email = 'user1@example.com';
        calculationRepository.items[1].user_email = 'user2@example.com';
        calculationRepository.items[1].user_name = 'User Two';
        const allResult = await listFootprintCalculations({ calculationRepository }, { user_id: 'admin-1', is_admin: true });
        expect(allResult.calculations.length).toBe(2);
        const filteredResult = await listFootprintCalculations({ calculationRepository }, { user_id: 'admin-1', is_admin: true, user_email: 'user2@example.com' });
        expect(filteredResult.calculations.length).toBe(1);
        expect(filteredResult.calculations[0]?.user_email).toBe('user2@example.com');
        expect(filteredResult.calculations[0]?.user_name).toBe('User Two');
    });
    it('allows admin to view calculation detail for other users', async () => {
        const calculationRepository = new MemoryFootprintCalculationRepository();
        const inputRepository = new MemoryFootprintInputRepository();
        const breakdownRepository = new MemoryFootprintBreakdownRepository();
        const calculation = {
            id: 'calc-1',
            user_id: 'user-2',
            profile_type: 'individual',
            period_start: new Date('2026-01-01'),
            period_end: new Date('2026-02-01'),
            total_kg_co2e: 10,
            total_t_co2e: 0.01,
            unit: 'kg',
            calculation_method: 'activity_based',
            data_quality: 'estimated',
            factors_version: '2026-01',
            status: 'draft',
            finalized_at: null,
            created_at: new Date('2026-01-02T00:00:00Z'),
            updated_at: new Date('2026-01-02T00:00:00Z'),
            deleted_at: null
        };
        await calculationRepository.save(calculation);
        calculationRepository.items[0].user_email = 'user2@example.com';
        const result = await getFootprintCalculation({
            calculationRepository,
            inputRepository,
            breakdownRepository
        }, 'calc-1', 'admin-1', { is_admin: true });
        expect(result.user_id).toBe('user-2');
        expect(result.user_email).toBe('user2@example.com');
    });
});
