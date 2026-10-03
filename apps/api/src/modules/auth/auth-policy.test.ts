import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/index.js', () => ({
  env: {
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://trace.example',
    OUTBOX_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  },
}));
const { cookieName, cookieOptions, readSessionCookie, sessionCsrfToken } =
  await import('./auth-policy.js');

describe('production session policy', () => {
  it('uses a host-only secure HTTP-only cookie', () => {
    expect(cookieName).toBe('__Host-trace-session');
    expect(cookieOptions).toEqual({ secure: true, httpOnly: true, sameSite: 'lax', path: '/' });
  });
  it('rejects malformed and ambiguous session cookies', () => {
    const raw = 'a'.repeat(43);
    expect(readSessionCookie(`${cookieName}=${raw}`)).toBe(raw);
    expect(readSessionCookie(`${cookieName}=${raw}; ${cookieName}=${raw}`)).toBeNull();
    expect(readSessionCookie(`${cookieName}=bad%token`)).toBeNull();
  });
  it('binds the reproducible CSRF token to the individual session', () => {
    expect(sessionCsrfToken('first')).toBe(sessionCsrfToken('first'));
    expect(sessionCsrfToken('first')).not.toBe(sessionCsrfToken('second'));
  });
});
