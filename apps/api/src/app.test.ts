import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('application HTTP foundation', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it('reports that the API process is alive', async () => {
    const response = await request(app).get('/health');
    const body: unknown = response.body;

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toEqual(expect.stringMatching(uuidPattern));
    expect(body).toEqual({
      message: 'All good',
      status: 'ok',
    });
  });

  it('returns the request ID in a JSON 404 response', async () => {
    const response = await request(app).get('/missing');
    const requestId = response.headers['x-request-id'];
    const body: unknown = response.body;

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(requestId).toEqual(expect.stringMatching(uuidPattern));
    expect(body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route GET /missing was not found',
        requestId,
      },
    });
  });

  it('returns a standard error for malformed JSON', async () => {
    const response = await request(app)
      .post('/anything')
      .set('content-type', 'application/json')
      .send('{"invalid"');

    const requestId = response.headers['x-request-id'];
    const body: unknown = response.body;

    expect(response.status).toBe(400);
    expect(requestId).toEqual(expect.stringMatching(uuidPattern));
    expect(body).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON',
        requestId,
      },
    });
  });
});

describe('GET /ready', () => {
  it('reports ready when PostgreSQL responds', async () => {
    // This fake succeeds without contacting the real Docker database.
    const databaseCheck = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const readinessApp = createApp({
      checkDatabaseConnection: databaseCheck,
    });

    const response = await request(readinessApp).get('/ready');
    const body: unknown = response.body;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: 'All good',
      status: 'ready',
    });
    expect(databaseCheck).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when PostgreSQL does not respond', async () => {
    // This fake simulates a database failure in a controlled test.
    const databaseCheck = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('PostgreSQL unavailable'));

    const readinessApp = createApp({
      checkDatabaseConnection: databaseCheck,
    });

    const response = await request(readinessApp).get('/ready');
    const body: unknown = response.body;

    expect(response.status).toBe(503);
    expect(body).toEqual({
      message: 'Service Unavailable',
      status: 'not_ready',
    });
    expect(databaseCheck).toHaveBeenCalledTimes(1);
  });
});
