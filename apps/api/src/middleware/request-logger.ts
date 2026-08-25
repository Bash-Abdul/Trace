import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { pinoHttp } from 'pino-http';

import { logger } from '../utils/logger.js';

export const requestLogger = pinoHttp({
  logger,

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
