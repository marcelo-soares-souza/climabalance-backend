export const DATA_QUALITIES = ['real', 'estimated', 'standard'];
export function isValidDataQuality(value) {
    return DATA_QUALITIES.includes(value);
}
export function validateDataQuality(value) {
    if (!isValidDataQuality(value)) {
        throw new Error(`Invalid data quality: ${value}. Must be one of: ${DATA_QUALITIES.join(', ')}`);
    }
    return value;
}
