import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from './app.js';

describe('GET /health', () => {
  it('reports that the API process is alive', async () => {
    const response = await request(app).get('/health');
    const body: unknown = response.body;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: 'All good',
      status: 'ok',
    });
  });
});
