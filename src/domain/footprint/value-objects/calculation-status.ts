/**
 * Status for footprint calculations
 * - draft: Can be edited and updated
 * - finalized: Immutable, used for compensation
 */
export type CalculationStatus = 'draft' | 'finalized';

export const CALCULATION_STATUSES: CalculationStatus[] = ['draft', 'finalized'];

export function isValidCalculationStatus(value: string): value is CalculationStatus {
  return CALCULATION_STATUSES.includes(value as CalculationStatus);
}

export function validateCalculationStatus(value: string): CalculationStatus {
  if (!isValidCalculationStatus(value)) {
    throw new Error(`Invalid calculation status: ${value}. Must be one of: ${CALCULATION_STATUSES.join(', ')}`);
  }
  return value;
}
