import type { EmissionFactorRepository } from '../../domain/footprint/repositories/emission-factor-repository';
import type { CreateFootprintInputDTO } from '../../domain/footprint/entities/footprint-input';
import type { DataQuality } from '../../domain/footprint/value-objects/data-quality';
import { FootprintCalculatorService } from '../../domain/footprint/services/footprint-calculator.service';
import { validateProfileType } from '../../domain/footprint/value-objects/profile-type';
import { validateDataQuality } from '../../domain/footprint/value-objects/data-quality';
import { validateInputValue } from '../../domain/footprint/entities/footprint-input';
import { ValidationError, NotFoundError } from '../../domain/errors';

export interface CalculateGuestFootprintRequest {
  profile_type: string;
  period_start: string;
  period_end: string;
  inputs: CreateFootprintInputDTO[];
  data_quality?: string;
  factors_version?: string;
  region?: string;
}

export interface CalculateGuestFootprintResponse {
  total_kg_co2e: number;
  total_t_co2e: number;
  breakdown: Array<{
    category: string;
    kg_co2e: number;
    t_co2e: number;
  }>;
  data_quality: string;
  factors_version: string;
}

export interface CalculateGuestFootprintDeps {
  emissionFactorRepository: EmissionFactorRepository;
}

export async function calculateGuestFootprint(
  deps: CalculateGuestFootprintDeps,
  request: CalculateGuestFootprintRequest
): Promise<CalculateGuestFootprintResponse> {
  // 1. Validate request
  try {
    validateProfileType(request.profile_type);
  } catch (error) {
    throw new ValidationError([
      { field: 'profile_type', message: error instanceof Error ? error.message : 'Invalid profile type' }
    ]);
  }

  let dataQuality: DataQuality;
  try {
    dataQuality = (request.data_quality
      ? validateDataQuality(request.data_quality)
      : 'estimated') as DataQuality;
  } catch (error) {
    throw new ValidationError([
      { field: 'data_quality', message: error instanceof Error ? error.message : 'Invalid data quality' }
    ]);
  }

  try {
    void Period.fromStrings(request.period_start, request.period_end);
  } catch (error) {
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
    } catch (error) {
      throw new ValidationError([
        {
          field: `inputs.${index}.value`,
          message: error instanceof Error ? error.message : 'Invalid input value'
        }
      ]);
    }
  }

  // 2. Get emission factors
  const factorsVersion =
    request.factors_version ||
    (await deps.emissionFactorRepository.getLatestVersion(region)) ||
    '2026-01';

  const factors = await deps.emissionFactorRepository.findByVersionAndRegion(
    factorsVersion,
    region
  );

  if (factors.length === 0) {
    throw new NotFoundError('footprint.emission_factors.not_found', {
      region,
      version: factorsVersion
    });
  }

  // 3. Calculate using domain service (same logic as authenticated endpoint)
  const calculatorService = new FootprintCalculatorService();
  let calculationResult: ReturnType<FootprintCalculatorService['calculate']>;
  try {
    calculationResult = calculatorService.calculate(request.inputs, factors);
  } catch (error) {
    throw new ValidationError([
      { field: 'inputs', message: error instanceof Error ? error.message : 'Invalid inputs' }
    ]);
  }

  // 4. Return result immediately (no persistence)
  return {
    total_kg_co2e: calculationResult.total_kg_co2e,
    total_t_co2e: calculationResult.total_t_co2e,
    breakdown: calculationResult.breakdown,
    data_quality: dataQuality,
    factors_version: factorsVersion
  };
}
