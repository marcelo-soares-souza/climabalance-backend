/**
 * Check if calculation can be edited
 */
export function canEditCalculation(calculation) {
    return calculation.status === 'draft' && !calculation.deleted_at;
}
/**
 * Check if calculation can be finalized
 */
export function canFinalizeCalculation(calculation) {
    return calculation.status === 'draft' && !calculation.deleted_at;
}
/**
 * Check if calculation can be deleted
 */
export function canDeleteCalculation(calculation) {
    // Only drafts can be deleted
    return calculation.status === 'draft' && !calculation.deleted_at;
}
/**
 * Convert kg to tons
 */
export function kgToTons(kg) {
    return kg / 1000;
}
/**
 * Convert tons to kg
 */
export function tonsToKg(tons) {
    return tons * 1000;
}
