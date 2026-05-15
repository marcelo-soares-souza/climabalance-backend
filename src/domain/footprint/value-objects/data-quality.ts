/**
 * Data quality indicator for calculations
 * - real: Actual metered/measured data
 * - estimated: Estimated based on average usage
 */
export type DataQuality = 'real' | 'estimated';

export const DATA_QUALITIES: DataQuality[] = ['real', 'estimated'];

export function isValidDataQuality(value: string): value is DataQuality {
  return DATA_QUALITIES.includes(value as DataQuality);
}

export function validateDataQuality(value: string): DataQuality {
  if (!isValidDataQuality(value)) {
    throw new Error(`Invalid data quality: ${value}. Must be one of: ${DATA_QUALITIES.join(', ')}`);
  }
  return value;
}
