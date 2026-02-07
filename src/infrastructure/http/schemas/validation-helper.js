import { ValidationError } from '../../../domain/errors';
export function parseWithSchema(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw ValidationError.fromZodError(result.error);
    }
    return result.data;
}
