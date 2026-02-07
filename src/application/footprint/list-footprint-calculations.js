export async function listFootprintCalculations(deps, request) {
    const filters = {};
    if (request.status) {
        filters.status = request.status;
    }
    if (request.profile_type) {
        filters.profile_type = request.profile_type;
    }
    if (request.is_admin && request.user_email) {
        const trimmed = request.user_email.trim();
        if (trimmed.length > 0) {
            filters.user_email = trimmed;
        }
    }
    filters.limit = request.limit || 50;
    filters.offset = request.offset || 0;
    const calculations = request.is_admin
        ? await deps.calculationRepository.findAll(filters)
        : await deps.calculationRepository.findByUserId(request.user_id, filters);
    return {
        calculations: calculations.map((c) => ({
            id: c.id,
            user_id: c.user_id,
            profile_type: c.profile_type,
            period_start: c.period_start.toISOString().split('T')[0],
            period_end: c.period_end.toISOString().split('T')[0],
            total_t_co2e: c.total_t_co2e,
            total_kg_co2e: c.total_kg_co2e,
            status: c.status,
            data_quality: c.data_quality,
            factors_version: c.factors_version,
            finalized_at: c.finalized_at ? c.finalized_at.toISOString() : null,
            created_at: c.created_at.toISOString(),
            updated_at: c.updated_at.toISOString(),
            user_email: c.user_email ?? null,
            user_name: c.user_name ?? null,
            inputs: [],
            breakdown: []
        }))
    };
}
