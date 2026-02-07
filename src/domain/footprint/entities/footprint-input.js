/**
 * Get metadata from input
 */
export function getInputMetadata(input) {
    if (!input.metadata_json) {
        return null;
    }
    try {
        return JSON.parse(input.metadata_json);
    }
    catch {
        return null;
    }
}
/**
 * Validate input value
 */
export function validateInputValue(value) {
    if (value < 0) {
        throw new Error('Input value must be non-negative');
    }
    if (!isFinite(value)) {
        throw new Error('Input value must be finite');
    }
}
