export class HttpConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "HttpConflictError";
  }
}

export class HttpNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = "HttpNotFoundError";
  }
}

export class HttpValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "HttpValidationError";
  }
}
