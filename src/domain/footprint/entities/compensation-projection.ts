/**
 * Compensation Projection entity
 * Represents a projection of how many trees are needed to compensate a calculation
 */
export interface CompensationProjection {
  id: string;
  calculation_id: string;
  area_id: string;
  biome: string | null;
  t_co2e_per_tree_per_year: number;
  trees_needed: number;
  horizon_years: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Calculate trees needed for compensation
 *
 * @param totalTCO2e - Total CO2e to compensate in tons
 * @param tCO2ePerTreePerYear - CO2e sequestered by one tree per year
 * @param horizonYears - Time horizon for compensation in years
 * @returns Number of trees needed
 */
export function calculateTreesNeeded(
  totalTCO2e: number,
  tCO2ePerTreePerYear: number,
  horizonYears: number
): number {
  if (tCO2ePerTreePerYear <= 0) {
    throw new Error('CO2e per tree per year must be positive');
  }

  if (horizonYears <= 0) {
    throw new Error('Horizon years must be positive');
  }

  const totalSequestrationPerTree = tCO2ePerTreePerYear * horizonYears;
  return Math.ceil(totalTCO2e / totalSequestrationPerTree);
}
