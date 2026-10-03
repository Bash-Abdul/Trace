import { randomUUID } from 'node:crypto';

import { closeDatabaseConnection, pool } from './config/db.js';
import { createOutboxWorkerRepository } from './modules/outbox/outbox-worker.repository.js';
import { processNextEmail } from './modules/outbox/outbox-worker.js';
import { createResendEmailProvider } from './modules/outbox/resend-email-provider.js';
import { logger } from './utils/logger.js';

// A bounded run for an external scheduler. No network sends occur on API startup.
async function run(): Promise<void> {
  let stopping = false;
  process.once('SIGINT', () => {
    stopping = true;
  });
  process.once('SIGTERM', () => {
    stopping = true;
  });
  try {
    const provider = createResendEmailProvider(process.env);
    const repository = createOutboxWorkerRepository(pool);
    const workerId = randomUUID();
    // Bounded housekeeping for expired rate-limit buckets, never account data.
    await pool.query(`DELETE FROM auth_rate_limits WHERE key IN (
      SELECT key FROM auth_rate_limits WHERE expires_at < now() ORDER BY expires_at LIMIT 1000
    )`);
    for (let count = 0; count < 100 && !stopping; count += 1) {
      const outcome = await processNextEmail(repository, provider, workerId);
      if (outcome === 'idle') break;
      logger.info({ outcome }, 'Email outbox attempt finished');
    }
  } finally {
    await closeDatabaseConnection();
  }
}

void run().catch(() => {
  logger.error('Email worker failed; check database connectivity and email configuration');
  process.exitCode = 1;
});
