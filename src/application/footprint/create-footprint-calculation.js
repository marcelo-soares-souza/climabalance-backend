import { FootprintCalculatorService } from '../../domain/footprint/services/footprint-calculator.service';
import { Period } from '../../domain/footprint/value-objects/period';
import { validateProfileType } from '../../domain/footprint/value-objects/profile-type';
import { validateDataQuality } from '../../domain/footprint/value-objects/data-quality';
import { validateInputValue } from '../../domain/footprint/entities/footprint-input';
import { ValidationError, NotFoundError } from '../../domain/errors';
export async function createFootprintCalculation(deps, request) {
    // 1. Validate request
    let profileType;
    try {
        profileType = validateProfileType(request.profile_type);
    }
    catch (error) {
        throw new ValidationError([
            { field: 'profile_type', message: error instanceof Error ? error.message : 'Invalid profile type' }
        ]);
    }
    let dataQuality;
    try {
        dataQuality = (request.data_quality
            ? validateDataQuality(request.data_quality)
            : 'estimated');
    }
    catch (error) {
        throw new ValidationError([
            { field: 'data_quality', message: error instanceof Error ? error.message : 'Invalid data quality' }
        ]);
    }
    let period;
    try {
        period = Period.fromStrings(request.period_start, request.period_end);
    }
    catch (error) {
        throw new ValidationError([
            { field: 'period', message: error instanceof Error ? error.message : 'Invalid period' }
        ]);
    }
    const region = request.region || 'BR';
    if (request.inputs.length === 0) {
        throw new ValidationError([
            { field: 'inputs', message: 'At least one input is required' }
        ]);
    }
    // Validate all input values
    for (const [index, input] of request.inputs.entries()) {
        try {
            validateInputValue(input.value);
        }
        catch (error) {
            throw new ValidationError([
                {
                    field: `inputs.${index}.value`,
                    message: error instanceof Error ? error.message : 'Invalid input value'
                }
            ]);
        }
    }
    // 2. Get emission factors
    const factorsVersion = request.factors_version ||
        (await deps.emissionFactorRepository.getLatestVersion(region)) ||
        '2026-01';
    const factors = await deps.emissionFactorRepository.findByVersionAndRegion(factorsVersion, region);
    if (factors.length === 0) {
        throw new NotFoundError('footprint.emission_factors.not_found', {
            region,
            version: factorsVersion
        });
    }
    // 3. Calculate using domain service
    const calculatorService = new FootprintCalculatorService();
    let calculationResult;
    try {
        calculationResult = calculatorService.calculate(request.inputs, factors);
    }
    catch (error) {
        throw new ValidationError([
            { field: 'inputs', message: error instanceof Error ? error.message : 'Invalid inputs' }
        ]);
    }
    // 4. Create calculation entity
    const calculationId = deps.idGenerator.generate();
    const now = deps.clock.now();
    const calculation = {
        id: calculationId,
        user_id: request.user_id,
        profile_type: profileType,
        period_start: period.start,
        period_end: period.end,
        total_kg_co2e: calculationResult.total_kg_co2e,
        total_t_co2e: calculationResult.total_t_co2e,
        unit: 'kg',
        calculation_method: 'activity_based',
        data_quality: dataQuality,
        factors_version: factorsVersion,
        status: 'draft',
        finalized_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null
    };
    // 5. Persist in transaction
    await deps.unitOfWork.execute(async (tx) => {
        const calculationRepository = tx.getFootprintCalculationRepository();
        const inputRepository = tx.getFootprintInputRepository();
        const breakdownRepository = tx.getFootprintBreakdownRepository();
        // Save calculation
        await calculationRepository.save(calculation);
        // Save inputs
        const inputEntities = calculationResult.inputsWithEmissions.map((item) => ({
            id: deps.idGenerator.generate(),
            calculation_id: calculationId,
            activity_type: item.activity_type,
            category: item.input.category,
            quantity: item.input.value,
            unit: item.input.unit,
            kg_co2e: item.kg_co2e,
            metadata_json: item.input.metadata ? JSON.stringify(item.input.metadata) : null,
            created_at: now,
            updated_at: now,
            deleted_at: null
        }));
        await inputRepository.saveMany(inputEntities);
        // Save breakdown
        const breakdownEntities = calculationResult.breakdown.map((item) => ({
            id: deps.idGenerator.generate(),
            calculation_id: calculationId,
            category: item.category,
            kg_co2e: item.kg_co2e,
            t_co2e: item.t_co2e,
            created_at: now,
            updated_at: now,
            deleted_at: null
        }));
        await breakdownRepository.saveMany(breakdownEntities);
    });
    // 6. Return response
    return {
        calculation_id: calculationId,
        total_kg_co2e: calculation.total_kg_co2e,
        total_t_co2e: calculation.total_t_co2e,
        breakdown: calculationResult.breakdown,
        status: calculation.status,
        data_quality: calculation.data_quality,
        factors_version: calculation.factors_version
    };
}
