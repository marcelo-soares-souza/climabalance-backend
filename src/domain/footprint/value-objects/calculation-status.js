export const CALCULATION_STATUSES = ['draft', 'finalized'];
export function isValidCalculationStatus(value) {
    return CALCULATION_STATUSES.includes(value);
}
export function validateCalculationStatus(value) {
    if (!isValidCalculationStatus(value)) {
        throw new Error(`Invalid calculation status: ${value}. Must be one of: ${CALCULATION_STATUSES.join(', ')}`);
    }
    return value;
}
