import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { env } from './config/index.js';
import { runEmailWorkerLoop } from './modules/outbox/email-worker-loop.js';
import { createOutboxWorkerRepository } from './modules/outbox/outbox-worker.repository.js';
import { processNextEmail } from './modules/outbox/outbox-worker.js';
import {
  createResendEmailProvider,
  EmailConfigurationError,
} from './modules/outbox/resend-email-provider.js';
import { logger } from './utils/logger.js';

async function run(): Promise<void> {
  const provider = createResendEmailProvider(process.env);
  // Worker-only limits: keep database stalls bounded without changing HTTP transactions.
  const database = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 10_000,
  });
  database.on('error', () => logger.warn('Email worker idle database connection lost'));
  const repository = createOutboxWorkerRepository(database);
  const workerId = randomUUID();
  const controller = new AbortController();
  let deadline: NodeJS.Timeout | undefined;
  const stop = () => {
    if (controller.signal.aborted) return;
    logger.info('Email worker stopping; finishing the current attempt');
    controller.abort();
    deadline = setTimeout(() => {
      logger.error('Email worker shutdown deadline exceeded; unfinished leases will expire');
      process.exit(1);
    }, 45_000);
    deadline.unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  logger.info('Email worker started');
  try {
    await runEmailWorkerLoop({
      signal: controller.signal,
      processNext: () => processNextEmail(repository, provider, workerId),
      cleanup: async () => {
        await database.query(`DELETE FROM auth_rate_limits WHERE key IN (
          SELECT key FROM auth_rate_limits WHERE expires_at < now() ORDER BY expires_at LIMIT 1000
        )`);
      },
      report: (outcome, retryMs) => {
        if (outcome === 'infrastructure-error')
          logger.warn({ retryMs }, 'Email worker infrastructure failure; retrying');
        else logger.info({ outcome }, 'Email outbox attempt finished');
      },
    });
  } finally {
    await database.end();
    clearTimeout(deadline);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    logger.info('Email worker stopped');
  }
}

void run().catch((error: unknown) => {
  if (error instanceof EmailConfigurationError) {
    logger.error(
      { fields: error.fields },
      'Email worker configuration invalid: API key must be present; EMAIL_FROM must be a plain email address; email URLs must be HTTPS without credentials, query or fragment',
    );
  } else {
    logger.error('Email worker failed unexpectedly; no sensitive error details were logged');
  }
  process.exitCode = 1;
});
