import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env.js';

const validOutboxEncryptionKey = Buffer.alloc(32, 1).toString('base64');

describe('parseEnvironment', () => {
  it('parses valid configuration', () => {
    const environment = parseEnvironment({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace_test',
      LOG_LEVEL: 'warn',
      OUTBOX_ENCRYPTION_KEY: validOutboxEncryptionKey,
    });

    expect(environment).toMatchObject({
      NODE_ENV: 'test',
      PORT: 4000,
      DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace_test',
      LOG_LEVEL: 'warn',
      OUTBOX_ENCRYPTION_KEY: validOutboxEncryptionKey,
    });

    expect(Object.isFrozen(environment)).toBe(true);
  });

  it('applies safe development defaults', () => {
    const environment = parseEnvironment({
      DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace',
      OUTBOX_ENCRYPTION_KEY: validOutboxEncryptionKey,
    });

    expect(environment.NODE_ENV).toBe('development');
    expect(environment.PORT).toBe(3000);
    expect(environment.LOG_LEVEL).toBe('info');
  });

  it('rejects a missing database URL', () => {
    expect(() => parseEnvironment({})).toThrowError(/DATABASE_URL/);
  });

  it('rejects an invalid database protocol', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'https://example.com/database',
      }),
    ).toThrowError(/PostgreSQL/);
  });

  it('rejects an invalid port', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace',
        PORT: '70000',
      }),
    ).toThrowError(/PORT/);
  });

  it('rejects an invalid outbox encryption key', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace',
        OUTBOX_ENCRYPTION_KEY: 'not-a-valid-32-byte-key',
      }),
    ).toThrowError(/OUTBOX_ENCRYPTION_KEY/);
  });
  it('requires an explicit HTTPS origin in production and ordered session lifetimes', () => {
    const base = {
      DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace',
      OUTBOX_ENCRYPTION_KEY: validOutboxEncryptionKey,
    };
    expect(() => parseEnvironment({ ...base, NODE_ENV: 'production' })).toThrow(/HTTPS/);
    expect(() =>
      parseEnvironment({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' }),
    ).toThrow(/HTTPS/);
    expect(() =>
      parseEnvironment({ ...base, SESSION_IDLE_SECONDS: '1000', SESSION_ABSOLUTE_SECONDS: '100' }),
    ).toThrow(/idle lifetime/);
    expect(
      parseEnvironment({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://trace.example' })
        .APP_ORIGIN,
    ).toBe('https://trace.example');
  });
});
