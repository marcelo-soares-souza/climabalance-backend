import { DomainError } from "./base-error";

export type FieldError = {
  field: string;
  message: string;
};

export class ValidationError extends DomainError {
  public readonly fieldErrors: FieldError[];

  constructor(fieldErrors: FieldError[]) {
    const message = `Validation failed: ${fieldErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`;
    super(message, "VALIDATION_FAILED", 400, "request.validation_failed", {
      fieldErrors,
    });
    this.fieldErrors = fieldErrors;
  }

  static fromZodError(error: {
    issues: Array<{ path: Array<string | number>; message: string }>;
  }): ValidationError {
    const fieldErrors: FieldError[] = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return new ValidationError(fieldErrors);
  }
}
