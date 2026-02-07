export function base64UrlEncode(input) {
    const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const base64 = Buffer.from(data).toString('base64');
    return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
export function base64UrlDecode(input) {
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding) {
        base64 += '='.repeat(4 - padding);
    }
    return new Uint8Array(Buffer.from(base64, 'base64'));
}
