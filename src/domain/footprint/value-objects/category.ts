/**
 * Categories for footprint inputs
 *
 * Individual:
 * - energy: Residential electricity consumption
 * - fuel: Direct fuel consumption (gas, ethanol, diesel)
 * - transport: Terrestrial transport (car, bus, metro, etc.)
 * - flights: Air travel
 *
 * Legal Entity:
 * - scope1: Direct emissions (combustion, fleet)
 * - scope2: Purchased electricity
 * - scope3: Value chain (logistics, employee commute, business travel)
 */
export type FootprintCategory =
  | 'energy'
  | 'fuel'
  | 'transport'
  | 'flights'
  | 'scope1'
  | 'scope2'
  | 'scope3';

export const FOOTPRINT_CATEGORIES: FootprintCategory[] = [
  'energy',
  'fuel',
  'transport',
  'flights',
  'scope1',
  'scope2',
  'scope3'
];

export const INDIVIDUAL_CATEGORIES: FootprintCategory[] = [
  'energy',
  'fuel',
  'transport',
  'flights'
];

export const LEGAL_ENTITY_CATEGORIES: FootprintCategory[] = [
  'scope1',
  'scope2',
  'scope3'
];

export function isValidCategory(value: string): value is FootprintCategory {
  return FOOTPRINT_CATEGORIES.includes(value as FootprintCategory);
}

export function validateCategory(value: string): FootprintCategory {
  if (!isValidCategory(value)) {
    throw new Error(`Invalid category: ${value}. Must be one of: ${FOOTPRINT_CATEGORIES.join(', ')}`);
  }
  return value;
}

export function getCategoriesForProfileType(profileType: 'individual' | 'legal_entity'): FootprintCategory[] {
  return profileType === 'individual' ? INDIVIDUAL_CATEGORIES : LEGAL_ENTITY_CATEGORIES;
}
