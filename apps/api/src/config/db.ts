import pg, { type Pool, type PoolClient } from 'pg';

import { logger } from '../utils/logger.js';
import { env } from './index.js';

const { Pool: PostgresPool } = pg;

export const pool = new PostgresPool({
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

type TransactionOperation<T> = (client: PoolClient) => Promise<T>;

/*
 * Creates a transaction function tied to a particular connection pool.
 * Production uses the main pool; integration tests inject their test pool.
 */
export function createTransactionRunner(databasePool: Pool) {
  return async function runTransaction<T>(operation: TransactionOperation<T>): Promise<T> {
    const client = await databasePool.connect();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      // Every query in the operation must use this same client.
      const result = await operation(client);

      await client.query('COMMIT');

      return result;
    } catch (error: unknown) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError: unknown) {
          logger.error(
            {
              err: rollbackError,
            },
            'PostgreSQL transaction rollback failed',
          );
        }
      }

      throw error;
    } finally {
      client.release();
    }
  };
}

// Application services use this transaction runner.
export const withTransaction = createTransactionRunner(pool);
