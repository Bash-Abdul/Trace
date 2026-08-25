import { createApp } from './app.js';
import { env } from './config/index.js';
import { logger } from './utils/logger.js';

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

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info({ signal }, 'Trace API shutdown started');

  server.close((error) => {
    if (error) {
      logger.error({ err: error, signal }, 'Trace API shutdown failed');
      process.exitCode = 1;
      return;
    }

    logger.info({ signal }, 'Trace API shutdown completed');
  });
}

process.once('SIGINT', () => {
  shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
