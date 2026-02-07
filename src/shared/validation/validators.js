export function requireString(input, field, maxLength = 255) {
    if (typeof input !== 'string' || input.trim().length === 0) {
        return { field, message: 'required' };
    }
    if (input.length > maxLength) {
        return { field, message: 'too_long' };
    }
    return input.trim();
}
export function requireEmail(input, field = 'email') {
    const value = requireString(input, field, 320);
    if (typeof value !== 'string')
        return value;
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (!ok)
        return { field, message: 'invalid_email' };
    return value.toLowerCase();
}
export function optionalString(input, field, maxLength = 255) {
    if (input === undefined || input === null || input === '')
        return undefined;
    return requireString(input, field, maxLength);
}
