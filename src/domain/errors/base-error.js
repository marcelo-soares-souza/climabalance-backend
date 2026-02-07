export class DomainError extends Error {
    code;
    httpStatus;
    i18nKey;
    metadata;
    constructor(message, code, httpStatus, i18nKey, metadata) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.httpStatus = httpStatus;
        this.i18nKey = i18nKey;
        this.metadata = metadata;
        Error.captureStackTrace(this, this.constructor);
    }
}
