import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './env.js';

describe('parseEnvironment', () => {
  it('parses valid configuration', () => {
    const environment = parseEnvironment({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace_test',
      LOG_LEVEL: 'warn',
    });

    expect(environment).toEqual({
      NODE_ENV: 'test',
      PORT: 4000,
      DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace_test',
      LOG_LEVEL: 'warn',
    });

    expect(Object.isFrozen(environment)).toBe(true);
  });

  it('applies safe development defaults', () => {
    const environment = parseEnvironment({
      DATABASE_URL: 'postgresql://trace:trace@localhost:5432/trace',
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
});
