import { NotFoundError, ValidationError } from '../../domain/errors';
export async function createCompensationAtomic(deps, input) {
    validateInput(input);
    const now = deps.clock.now();
    const compensationId = deps.idGenerator.generate();
    const compensationMode = input.compensationMode ?? 'tco2e';
    const result = await deps.store.runInTransaction(async (tx) => {
        const area = await tx.lockArea(input.areaId);
        if (!area) {
            throw new NotFoundError('area.not_found');
        }
        if (area.status !== 'active') {
            throw new ValidationError([
                {
                    field: 'area_id',
                    message: 'area_not_active',
                },
            ]);
        }
        const available = Math.max(area.totalCapacityTCO2e - area.committedTCO2e, 0);
        if (available < input.totalTCO2e) {
            throw new ValidationError([
                {
                    field: 'total_t_co2e',
                    message: 'insufficient_capacity',
                },
            ]);
        }
        const newCommitted = area.committedTCO2e + input.totalTCO2e;
        await tx.updateAreaCommitted(area.id, newCommitted, now);
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
            status: 'pending',
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
            status: 'pending',
            remainingTCO2e: Math.max(area.totalCapacityTCO2e - newCommitted, 0),
            createdAt: now,
        };
    });
    await deps.auditLog.log({
        actorUserId: input.supporterUserId,
        action: 'compensation.created_pending',
        entityType: 'compensation',
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
            remaining_t_co2e: result.remainingTCO2e,
        },
    });
    return result;
}
function validateInput(input) {
    const errors = [];
    const mode = input.compensationMode ?? 'tco2e';
    if (input.totalTCO2e <= 0) {
        errors.push({ field: 'total_t_co2e', message: 'must_be_positive' });
    }
    if (input.totalAmount <= 0) {
        errors.push({ field: 'total_amount', message: 'must_be_positive' });
    }
    if (input.treesCount <= 0) {
        errors.push({ field: 'trees_count', message: 'must_be_positive' });
    }
    if (!input.currency || input.currency.length !== 3) {
        errors.push({ field: 'currency', message: 'must_be_iso_4217' });
    }
    if (mode !== 'tco2e' && mode !== 'tree_purchase') {
        errors.push({ field: 'compensation_mode', message: 'invalid_mode' });
    }
    if (mode === 'tree_purchase') {
        if (!input.horizonYears || input.horizonYears <= 0) {
            errors.push({ field: 'horizon_years', message: 'must_be_positive' });
        }
        if (!input.treesRequested || input.treesRequested <= 0) {
            errors.push({ field: 'trees_requested', message: 'must_be_positive' });
        }
        if (!input.pricePerTree || input.pricePerTree <= 0) {
            errors.push({ field: 'price_per_tree', message: 'must_be_positive' });
        }
    }
    if (errors.length > 0) {
        throw new ValidationError(errors);
    }
}
