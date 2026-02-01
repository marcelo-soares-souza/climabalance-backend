import type { ProfileType } from '../value-objects/profile-type';
import type { CalculationStatus } from '../value-objects/calculation-status';
import type { DataQuality } from '../value-objects/data-quality';

/**
 * Footprint Calculation entity
 * Represents a complete CO2 footprint calculation
 */
export interface FootprintCalculation {
  id: string;
  user_id: string;
  profile_type: ProfileType;
  period_start: Date;
  period_end: Date;
  total_kg_co2e: number;
  total_t_co2e: number;
  unit: string;
  calculation_method: string | null;
  data_quality: DataQuality;
  factors_version: string;
  status: CalculationStatus;
  finalized_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Check if calculation can be edited
 */
export function canEditCalculation(calculation: FootprintCalculation): boolean {
  return calculation.status === 'draft' && !calculation.deleted_at;
}

/**
 * Check if calculation can be finalized
 */
export function canFinalizeCalculation(calculation: FootprintCalculation): boolean {
  return calculation.status === 'draft' && !calculation.deleted_at;
}

/**
 * Check if calculation can be deleted
 */
export function canDeleteCalculation(calculation: FootprintCalculation): boolean {
  // Only drafts can be deleted
  return calculation.status === 'draft' && !calculation.deleted_at;
}

/**
 * Convert kg to tons
 */
export function kgToTons(kg: number): number {
  return kg / 1000;
}

/**
 * Convert tons to kg
 */
export function tonsToKg(tons: number): number {
  return tons * 1000;
}
