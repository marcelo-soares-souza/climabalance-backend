import { NotFoundError, ForbiddenError } from '../../domain/errors';
export async function getFootprintCalculation(deps, calculationId, userId, options) {
    const calculation = await deps.calculationRepository.findByIdWithUser(calculationId);
    if (!calculation) {
        throw new NotFoundError('footprint.calculation.not_found');
    }
    if (!options?.is_admin && calculation.user_id !== userId) {
        throw new ForbiddenError('footprint.calculation.not_owner');
    }
    const [inputs, breakdown] = await Promise.all([
        deps.inputRepository.findByCalculationId(calculationId),
        deps.breakdownRepository.findByCalculationId(calculationId)
    ]);
    return {
        id: calculation.id,
        user_id: calculation.user_id,
        profile_type: calculation.profile_type,
        period_start: calculation.period_start.toISOString().split('T')[0],
        period_end: calculation.period_end.toISOString().split('T')[0],
        total_kg_co2e: calculation.total_kg_co2e,
        total_t_co2e: calculation.total_t_co2e,
        data_quality: calculation.data_quality,
        factors_version: calculation.factors_version,
        status: calculation.status,
        finalized_at: calculation.finalized_at ? calculation.finalized_at.toISOString() : null,
        created_at: calculation.created_at.toISOString(),
        updated_at: calculation.updated_at.toISOString(),
        user_email: calculation.user_email ?? null,
        user_name: calculation.user_name ?? null,
        inputs: inputs.map((input) => ({
            id: input.id,
            category: input.category,
            activity_type: input.activity_type,
            quantity: input.quantity,
            unit: input.unit,
            kg_co2e: input.kg_co2e,
            metadata: input.metadata_json ? JSON.parse(input.metadata_json) : null
        })),
        breakdown: breakdown.map((b) => ({
            category: b.category,
            kg_co2e: b.kg_co2e,
            t_co2e: b.t_co2e
        }))
    };
}
