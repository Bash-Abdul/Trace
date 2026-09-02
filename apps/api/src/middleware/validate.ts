import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { badRequest } from '../utils/app-error.js';

type ValidationLocation = 'body' | 'params' | 'query';

interface ValidationSchema {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

interface ValidationIssue {
  field: string;
  message: string;
}

interface ValidationError {
  location: ValidationLocation;
  issues: ValidationIssue[];
}

/*
 * Creates validation middleware for any combination of:
 * request body, route parameters and query parameters.
 */
export function validate(schemas: ValidationSchema): RequestHandler {
  return (request, response, next) => {
    const errors: ValidationError[] = [];

    let validatedBody: unknown;
    let validatedParams: unknown;
    let validatedQuery: unknown;

    if (schemas.body) {
      const result = schemas.body.safeParse(request.body);

      if (result.success) {
        validatedBody = result.data;
      } else {
        errors.push({
          location: 'body',
          issues: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(request.params);

      if (result.success) {
        validatedParams = result.data;
      } else {
        errors.push({
          location: 'params',
          issues: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(request.query);

      if (result.success) {
        validatedQuery = result.data;
      } else {
        errors.push({
          location: 'query',
          issues: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
    }

    if (errors.length > 0) {
      next(badRequest('Validation failed', 'VALIDATION_ERROR', errors));

      return;
    }

    /*
     * Only replace request data after every supplied schema passes.
     * That prevents partially modifying a request that will be rejected.
     */
    if (schemas.body) {
      request.body = validatedBody;
    }

    if (schemas.params) {
      request.params = validatedParams as typeof request.params;
    }

    /*
     * In Express 5, request.query is a getter and should not be reassigned.
     * Store its validated/transformed value in response.locals instead.
     */
    if (schemas.query) {
      response.locals.validatedQuery = validatedQuery;
    }

    next();
  };
}
