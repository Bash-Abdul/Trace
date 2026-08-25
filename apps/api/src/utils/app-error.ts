export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);

    this.name = 'AppError';
    Error.captureStackTrace(this, AppError);
  }
}

export const badRequest = (
  message = 'Bad Request',
  code = 'BAD_REQUEST',
  details?: unknown,
): AppError => new AppError(400, code, message, details);

export const unauthorized = (message = 'Unauthorized', code = 'UNAUTHORIZED'): AppError =>
  new AppError(401, code, message);

export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN'): AppError =>
  new AppError(403, code, message);

export const notFound = (message = 'Resource not found', code = 'NOT_FOUND'): AppError =>
  new AppError(404, code, message);

export const conflict = (message = 'Conflict', code = 'CONFLICT'): AppError =>
  new AppError(409, code, message);

export const internalServerError = (
  message = 'Internal Server Error',
  code = 'INTERNAL_SERVER_ERROR',
): AppError => new AppError(500, code, message);
