export const FOOTPRINT_CATEGORIES = [
    'energy',
    'fuel',
    'transport',
    'flights',
    'scope1',
    'scope2',
    'scope3'
];
export const INDIVIDUAL_CATEGORIES = [
    'energy',
    'fuel',
    'transport',
    'flights'
];
export const LEGAL_ENTITY_CATEGORIES = [
    'scope1',
    'scope2',
    'scope3'
];
export function isValidCategory(value) {
    return FOOTPRINT_CATEGORIES.includes(value);
}
export function validateCategory(value) {
    if (!isValidCategory(value)) {
        throw new Error(`Invalid category: ${value}. Must be one of: ${FOOTPRINT_CATEGORIES.join(', ')}`);
    }
    return value;
}
export function getCategoriesForProfileType(profileType) {
    return profileType === 'individual' ? INDIVIDUAL_CATEGORIES : LEGAL_ENTITY_CATEGORIES;
}
