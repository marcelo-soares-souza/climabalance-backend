import { z } from 'zod';
import { ValidationError } from '../../../domain/errors';

export function parseWithSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw ValidationError.fromZodError(result.error as unknown as { issues: Array<{ path: Array<string | number>; message: string }> });
  }

  return result.data;
}

export function parseQueryWithSchema<T>(
  schema: z.ZodSchema<T>,
  query: URLSearchParams,
): T {
  return parseWithSchema(schema, Object.fromEntries(query.entries()));
}
