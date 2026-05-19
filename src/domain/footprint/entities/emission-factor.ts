/**
 * Emission Factor entity
 * Represents a conversion factor from activity to CO2 equivalent emissions
 */
export interface EmissionFactor {
  id: string;
  activity_type: string;
  unit: string;
  factor_value: number;
  factor_unit: string;
  source: string;
  valid_from: Date | null;
  valid_to: Date | null;
  region: string;
  version: string;
  metadata_json: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Check if emission factor is currently valid
 */
export function isEmissionFactorValid(
  factor: EmissionFactor,
  date: Date = new Date(),
): boolean {
  if (factor.deleted_at) {
    return false;
  }

  if (factor.valid_from && date < factor.valid_from) {
    return false;
  }

  if (factor.valid_to && date > factor.valid_to) {
    return false;
  }

  return true;
}

/**
 * Parse metadata JSON if present
 */
export function getEmissionFactorMetadata(
  factor: EmissionFactor,
): Record<string, any> | null {
  if (!factor.metadata_json) {
    return null;
  }

  try {
    return JSON.parse(factor.metadata_json);
  } catch {
    return null;
  }
}
