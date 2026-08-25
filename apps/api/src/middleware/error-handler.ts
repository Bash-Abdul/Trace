import type { ErrorRequestHandler, RequestHandler } from 'express';

import { AppError, badRequest, internalServerError, notFound } from '../utils/app-error.js';

function isInvalidJsonError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const candidate = error as {
    type?: unknown;
  };

  return candidate.type === 'entity.parse.failed';
}

function getRequestId(requestId: unknown): string {
  if (typeof requestId === 'string') {
    return requestId;
  }

  return 'unknown-request';
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(notFound(`Route ${request.method} ${request.originalUrl} was not found`, 'ROUTE_NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let applicationError: AppError;

  if (error instanceof AppError) {
    applicationError = error;
  } else if (isInvalidJsonError(error)) {
    applicationError = badRequest('Request body contains invalid JSON', 'INVALID_JSON');
  } else {
    applicationError = internalServerError('An unexpected error occurred', 'INTERNAL_SERVER_ERROR');
  }

  const requestId = getRequestId(request.id);

  if (applicationError.statusCode >= 500) {
    request.log.error(
      {
        err: error,
        requestId,
      },
      'Request failed unexpectedly',
    );
  }

  const responseError: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  } = {
    code: applicationError.code,
    message: applicationError.message,
    requestId,
  };

  if (applicationError.statusCode < 500 && applicationError.details !== undefined) {
    responseError.details = applicationError.details;
  }

  response.status(applicationError.statusCode).json({
    error: responseError,
  });
};
