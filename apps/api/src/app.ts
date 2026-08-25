import express from 'express';

import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestLogger);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      message: 'All good',
      status: 'ok',
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
