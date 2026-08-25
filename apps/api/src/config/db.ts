import pg from 'pg';

import { logger } from '../utils/logger.js';
import { env } from './index.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on('error', (error) => {
  logger.error(
    {
      err: error,
    },
    'Unexpected error from an idle PostgreSQL client',
  );
});

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}
