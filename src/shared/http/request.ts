export async function parseJson(request: Request, maxBytes = 1024 * 64): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('invalid_content_type');
  }
  const reader = request.body?.getReader();
  if (!reader) return {};

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        throw new Error('payload_too_large');
      }
      chunks.push(value);
    }
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) return {};
  return JSON.parse(buffer.toString('utf-8'));
}
