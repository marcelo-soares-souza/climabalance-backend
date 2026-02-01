import type { FootprintCalculationRepository } from '../../domain/footprint/repositories/footprint-calculation-repository';
import type { CompensationProjectionRepository } from '../../domain/footprint/repositories/compensation-projection-repository';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import { calculateTreesNeeded } from '../../domain/footprint/entities/compensation-projection';
import { NotFoundError, ForbiddenError } from '../../domain/errors';

/**
 * Area repository interface (partial, for getting sequestration rate)
 */
export interface AreaRepository {
  findById(id: string): Promise<{
    id: string;
    biome: string | null;
    t_co2e_per_tree_per_year?: number;
  } | null>;
}

export interface CreateCompensationProjectionRequest {
  calculation_id: string;
  area_id: string;
  user_id: string;
  horizon_years?: number;
}

export interface CreateCompensationProjectionResponse {
  projection_id: string;
  calculation_id: string;
  area_id: string;
  biome: string | null;
  t_co2e_per_tree_per_year: number;
  trees_needed: number;
  horizon_years: number;
}

export interface CreateCompensationProjectionDeps {
  calculationRepository: FootprintCalculationRepository;
  projectionRepository: CompensationProjectionRepository;
  areaRepository: AreaRepository;
  idGenerator: IdGenerator;
  clock: Clock;
}

/**
 * Default CO2e sequestration rate per tree per year (in tCO2e)
 * Based on average Brazilian biomes
 * Can be overridden by area-specific data
 */
const DEFAULT_T_CO2E_PER_TREE_PER_YEAR = 0.02;

export async function createCompensationProjection(
  deps: CreateCompensationProjectionDeps,
  request: CreateCompensationProjectionRequest
): Promise<CreateCompensationProjectionResponse> {
  // 1. Validate calculation exists and belongs to user
  const calculation = await deps.calculationRepository.findById(request.calculation_id);

  if (!calculation) {
    throw new NotFoundError('footprint.calculation.not_found');
  }

  if (calculation.user_id !== request.user_id) {
    throw new ForbiddenError('footprint.calculation.not_owner');
  }

  // 2. Validate area exists
  const area = await deps.areaRepository.findById(request.area_id);

  if (!area) {
    throw new NotFoundError('area.not_found');
  }

  // 3. Get sequestration rate (area-specific or default)
  const tCO2ePerTreePerYear = area.t_co2e_per_tree_per_year || DEFAULT_T_CO2E_PER_TREE_PER_YEAR;

  // 4. Calculate trees needed
  const horizonYears = request.horizon_years || 5;
  const treesNeeded = calculateTreesNeeded(
    calculation.total_t_co2e,
    tCO2ePerTreePerYear,
    horizonYears
  );

  // 5. Create projection
  const projectionId = deps.idGenerator.generate();
  const now = deps.clock.now();

  const projection = {
    id: projectionId,
    calculation_id: request.calculation_id,
    area_id: request.area_id,
    biome: area.biome,
    t_co2e_per_tree_per_year: tCO2ePerTreePerYear,
    trees_needed: treesNeeded,
    horizon_years: horizonYears,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };

  await deps.projectionRepository.save(projection);

  return {
    projection_id: projectionId,
    calculation_id: request.calculation_id,
    area_id: request.area_id,
    biome: area.biome,
    t_co2e_per_tree_per_year: tCO2ePerTreePerYear,
    trees_needed: treesNeeded,
    horizon_years: horizonYears
  };
}
