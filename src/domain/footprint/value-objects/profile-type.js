export const PROFILE_TYPES = ['individual', 'legal_entity'];
export function isValidProfileType(value) {
    return PROFILE_TYPES.includes(value);
}
export function validateProfileType(value) {
    if (!isValidProfileType(value)) {
        throw new Error(`Invalid profile type: ${value}. Must be one of: ${PROFILE_TYPES.join(', ')}`);
    }
    return value;
}
