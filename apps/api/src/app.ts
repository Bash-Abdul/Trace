import express from 'express';

import { checkDatabaseConnection } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

interface AppDependencies {
  // Allows tests to replace the real PostgreSQL check with controlled behavior.
  checkDatabaseConnection: () => Promise<void>;
}

const defaultDependencies: AppDependencies = {
  checkDatabaseConnection,
};

export function createApp(dependencies: AppDependencies = defaultDependencies) {
  const app = express();

  app.disable('x-powered-by');

  app.use(requestLogger);
  app.use(express.json());

  // Liveness checks only whether the Express process can answer HTTP.
  app.get('/health', (_request, response) => {
    response.status(200).json({
      message: 'All good',
      status: 'ok',
    });
  });

  // Readiness checks whether required infrastructure is currently available.
  app.get('/ready', async (request, response) => {
    try {
      await dependencies.checkDatabaseConnection();

      response.status(200).json({
        message: 'All good',
        status: 'ready',
      });
    } catch (error: unknown) {
      request.log.error(
        {
          err: error,
        },
        'Database readiness check failed',
      );

      // The real database error stays in logs and is not exposed publicly.
      response.status(503).json({
        message: 'Service Unavailable',
        status: 'not_ready',
      });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
