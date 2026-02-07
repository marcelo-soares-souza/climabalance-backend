import { canFinalizeCalculation } from '../../domain/footprint/entities/footprint-calculation';
import { NotFoundError, ForbiddenError, ValidationError } from '../../domain/errors';
export async function finalizeFootprintCalculation(deps, calculationId, userId) {
    const calculation = await deps.calculationRepository.findById(calculationId);
    if (!calculation) {
        throw new NotFoundError('footprint.calculation.not_found');
    }
    if (calculation.user_id !== userId) {
        throw new ForbiddenError('footprint.calculation.not_owner');
    }
    if (!canFinalizeCalculation(calculation)) {
        throw new ValidationError([
            { field: 'status', message: 'Calculation is already finalized' }
        ]);
    }
    const now = deps.clock.now();
    calculation.status = 'finalized';
    calculation.finalized_at = now;
    calculation.updated_at = now;
    await deps.unitOfWork.execute(async (tx) => {
        const calculationRepository = tx.getFootprintCalculationRepository();
        const auditLogRepository = tx.getAuditLogRepository();
        await calculationRepository.update(calculation);
        await auditLogRepository.create({
            id: deps.idGenerator.generate(),
            actorUserId: userId,
            action: 'footprint_calculation.finalized',
            entityType: 'footprint_calculation',
            entityId: calculationId,
            reason: null,
            createdAt: now
        });
    });
}
