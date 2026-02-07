export async function getEmissionFactors(deps, request) {
    const region = request.region || 'BR';
    let version = request.version;
    if (!version) {
        version = (await deps.emissionFactorRepository.getLatestVersion(region)) || '2026-01';
    }
    let factors;
    if (request.category) {
        factors = await deps.emissionFactorRepository.findByCategory(request.category, version, region);
    }
    else {
        factors = await deps.emissionFactorRepository.findByVersionAndRegion(version, region);
    }
    return {
        factors: factors.map((f) => ({
            id: f.id,
            activity_type: f.activity_type,
            unit: f.unit,
            factor_value: f.factor_value,
            factor_unit: f.factor_unit,
            source: f.source,
            region: f.region,
            version: f.version
        }))
    };
}
