import 'dotenv/config';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import pg, { type PoolClient } from 'pg';
import type { Session, AuthenticatedHandler } from './auth.types.js';

const auth = vi.hoisted(() => ({ readSession: vi.fn(), withSession: vi.fn(), audit: vi.fn() }));
vi.mock('./auth.service.js', () => auth);
const { authenticateRead, authenticateMutation } = await import('./auth.middleware.js');
const { errorHandler } = await import('../../middleware/error-handler.js');
const { requestLogger } = await import('../../middleware/request-logger.js');
const { pool } = await import('../../config/db.js');
const { unauthorized } = await import('../../utils/app-error.js');
const identity = { id: 'session-id', user_id: 'account-id' };
beforeEach(() => {
  vi.clearAllMocks();
});
function app() {
  const instance = express();
  instance.use(express.json(), requestLogger);
  return instance;
}
describe('authenticated route boundary', () => {
  it('authenticates reads once without opening a mutation transaction', async () => {
    auth.readSession.mockResolvedValue(identity);
    const handler = vi.fn<AuthenticatedHandler<Record<string, never>, unknown, { ok: boolean }>>(
      () => Promise.resolve({ status: 200, body: { ok: true } }),
    );
    const server = app();
    server.get('/read', authenticateRead(handler));
    server.use(errorHandler);
    expect((await request(server).get('/read')).status).toBe(200);
    expect(auth.readSession).toHaveBeenCalledTimes(1);
    expect(auth.withSession).not.toHaveBeenCalled();
    expect(handler.mock.calls[0]?.[1]).toEqual({
      userId: identity.user_id,
      sessionId: identity.id,
      db: pool,
    });
  });
  it('rejects an invalid read session before calling the controller', async () => {
    auth.readSession.mockRejectedValue(unauthorized());
    const handler = vi.fn<AuthenticatedHandler<Record<string, never>, unknown, { ok: boolean }>>(
      () => Promise.resolve({ status: 200, body: { ok: true } }),
    );
    const server = app();
    server.get('/read', authenticateRead(handler));
    server.use(errorHandler);
    expect((await request(server).get('/read')).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
  it('does not send success when the transaction fails after the controller returns', async () => {
    // A deferred constraint/COMMIT failure occurs after the handler's successful result.
    auth.withSession.mockImplementation(
      async (
        _raw: string | null,
        _csrf: string,
        operation: (client: PoolClient, session: Session) => Promise<unknown>,
      ) => {
        const client: PoolClient = Object.assign(new pg.Client(), { release: vi.fn() });
        try {
          await operation(client, {
            ...identity,
            csrf_token_hash: '',
            created_at: new Date(),
            idle_expires_at: new Date(),
            absolute_expires_at: new Date(),
          });
          throw new Error('internal commit failure must not reach the client');
        } finally {
          client.release();
        }
      },
    );
    const server = app();
    server.post(
      '/write',
      authenticateMutation(() => Promise.resolve({ status: 201, body: { created: true } })),
    );
    server.use(errorHandler);
    const response = await request(server).post('/write').set('x-csrf-token', 'csrf');
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('created');
    expect(JSON.stringify(response.body)).not.toContain('internal commit');
    expect(auth.withSession).toHaveBeenCalledTimes(1);
    expect(auth.readSession).not.toHaveBeenCalled();
  });
});
