import { DomainError } from './base-error';
export class ValidationError extends DomainError {
    fieldErrors;
    constructor(fieldErrors) {
        const message = `Validation failed: ${fieldErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`;
        super(message, 'VALIDATION_FAILED', 400, 'request.validation_failed', { fieldErrors });
        this.fieldErrors = fieldErrors;
    }
    static fromZodError(error) {
        const fieldErrors = error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
        }));
        return new ValidationError(fieldErrors);
    }
}
