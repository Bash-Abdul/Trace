import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { pinoHttp } from 'pino-http';

import { logger } from '../utils/logger.js';

export const requestLogger = pinoHttp({
  logger,
  serializers: {
    req: (request: { id: string; method: string; url: string }) => ({
      id: request.id,
      method: request.method,
      // Never log token-bearing query strings or attacker-controlled path values.
      routeGroup: request.url?.startsWith('/api/v1/auth') ? '/api/v1/auth' : 'other',
    }),
  },

  genReqId: (_request: IncomingMessage, response: ServerResponse) => {
    const requestId = randomUUID();

    response.setHeader('x-request-id', requestId);

    return requestId;
  },

  customLogLevel: (_request: IncomingMessage, response: ServerResponse, error?: Error) => {
    if (error || response.statusCode >= 500) {
      return 'error';
    }

    if (response.statusCode >= 400) {
      return 'warn';
    }

    return 'info';
  },
});
