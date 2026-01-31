export abstract class DomainError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly i18nKey: string;
  public readonly metadata: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string,
    httpStatus: number,
    i18nKey: string,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.i18nKey = i18nKey;
    this.metadata = metadata;

    Error.captureStackTrace(this, this.constructor);
  }
}
