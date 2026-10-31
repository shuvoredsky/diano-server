export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: unknown;

  constructor(message: string, statusCode = 500, errors?: unknown, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', errors?: unknown): AppError {
    return new AppError(message, 400, errors);
  }

  static unauthorized(message = 'Unauthorized access', errors?: unknown): AppError {
    return new AppError(message, 401, errors);
  }

  static forbidden(message = 'Forbidden access', errors?: unknown): AppError {
    return new AppError(message, 403, errors);
  }

  static notFound(message = 'Resource not found', errors?: unknown): AppError {
    return new AppError(message, 404, errors);
  }

  static conflict(message = 'Resource conflict', errors?: unknown): AppError {
    return new AppError(message, 409, errors);
  }

  static unprocessable(message = 'Unprocessable Entity', errors?: unknown): AppError {
    return new AppError(message, 422, errors);
  }

  static internal(message = 'Internal server error', errors?: unknown): AppError {
    return new AppError(message, 500, errors, false);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable', errors?: unknown): AppError {
    return new AppError(message, 503, errors);
  }
}
