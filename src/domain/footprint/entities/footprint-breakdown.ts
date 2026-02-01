import type { FootprintCategory } from '../value-objects/category';

/**
 * Footprint Result Breakdown entity
 * Stores aggregated CO2e by category for a calculation
 */
export interface FootprintBreakdown {
  id: string;
  calculation_id: string;
  category: FootprintCategory;
  kg_co2e: number;
  t_co2e: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * DTO for breakdown result
 */
export interface BreakdownResultDTO {
  category: FootprintCategory;
  kg_co2e: number;
  t_co2e: number;
}
