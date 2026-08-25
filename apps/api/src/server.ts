import type { Server } from 'node:http';

import { createApp } from './app.js';
import { checkDatabaseConnection, closeDatabaseConnection } from './config/db.js';
import { env } from './config/index.js';
import { logger } from './utils/logger.js';

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function startServer(): Promise<void> {
  await checkDatabaseConnection();

  logger.info('PostgreSQL connection verified');

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        environment: env.NODE_ENV,
        port: env.PORT,
      },
      'Trace API started',
    );
  });

  let isShuttingDown = false;

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    logger.info({ signal }, 'Trace API shutdown started');

    try {
      await closeHttpServer(server);
      await closeDatabaseConnection();

      logger.info({ signal }, 'Trace API shutdown completed');
    } catch (error) {
      logger.error(
        {
          err: error,
          signal,
        },
        'Trace API shutdown failed',
      );

      process.exitCode = 1;
    }
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void startServer().catch((error: unknown) => {
  logger.fatal(
    {
      err: error,
    },
    'Trace API startup failed',
  );

  process.exitCode = 1;
});
