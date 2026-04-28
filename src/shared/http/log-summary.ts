const MAX_KEYS = 12;
const MAX_ARRAY_SAMPLE = 3;

function summarizePrimitive(value: string | number | boolean | null): unknown {
  if (typeof value === 'string') {
    return {
      type: 'string',
      length: value.length
    };
  }

  return value;
}

function summarizeArray(value: unknown[], depth: number): Record<string, unknown> {
  return {
    type: 'array',
    length: value.length,
    sample: value
      .slice(0, MAX_ARRAY_SAMPLE)
      .map((item) => summarizeBodyForLog(item, depth + 1))
  };
}

function summarizeObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  const entries = Object.entries(value);
  const summary: Record<string, unknown> = {
    type: 'object',
    key_count: entries.length,
    keys: entries.slice(0, MAX_KEYS).map(([key]) => key)
  };

  const identifiers: Record<string, string | number> = {};
  const arrays: Record<string, number> = {};
  const scalarFields: Record<string, string | number | boolean | null> = {};

  for (const [key, entry] of entries) {
    const normalized = key.toLowerCase();
    if ((normalized === 'id' || normalized.endsWith('_id') || normalized.endsWith('id'))
      && (typeof entry === 'string' || typeof entry === 'number')) {
      identifiers[key] = entry;
      continue;
    }

    if (Array.isArray(entry)) {
      arrays[key] = entry.length;
      continue;
    }

    if (
      normalized === 'status'
      || normalized === 'message_key'
      || normalized === 'code'
      || normalized.endsWith('_count')
      || normalized.endsWith('_total')
    ) {
      if (
        entry === null
        || typeof entry === 'string'
        || typeof entry === 'number'
        || typeof entry === 'boolean'
      ) {
        scalarFields[key] = entry;
      }
    }
  }

  if (Object.keys(identifiers).length > 0) {
    summary.identifiers = identifiers;
  }
  if (Object.keys(arrays).length > 0) {
    summary.array_lengths = arrays;
  }
  if (Object.keys(scalarFields).length > 0) {
    summary.fields = scalarFields;
  }

  if (depth === 0 && 'data' in value && value.data !== undefined) {
    summary.data = summarizeBodyForLog(value.data, depth + 1);
  }
  if (depth === 0 && 'error' in value && value.error !== undefined) {
    summary.error = summarizeBodyForLog(value.error, depth + 1);
  }

  return summary;
}

export function summarizeBodyForLog(value: unknown, depth = 0): unknown {
  if (depth > 2) {
    return '[TRUNCATED]';
  }
  if (value === null) return null;
  if (value === undefined) {
    return { type: 'undefined' };
  }
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return summarizePrimitive(value);
  }
  if (Array.isArray(value)) {
    return summarizeArray(value, depth);
  }
  if (typeof value === 'object') {
    return summarizeObject(value as Record<string, unknown>, depth);
  }

  return {
    type: typeof value
  };
}

export function summarizeQueryForLog(query: URLSearchParams): Record<string, unknown> {
  const keys = Array.from(new Set(query.keys()));
  return {
    key_count: keys.length,
    keys: keys.slice(0, MAX_KEYS)
  };
}

export function parseContentLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
