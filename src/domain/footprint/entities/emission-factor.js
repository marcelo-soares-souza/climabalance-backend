/**
 * Check if emission factor is currently valid
 */
export function isEmissionFactorValid(factor, date = new Date()) {
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
export function getEmissionFactorMetadata(factor) {
    if (!factor.metadata_json) {
        return null;
    }
    try {
        return JSON.parse(factor.metadata_json);
    }
    catch {
        return null;
    }
}
