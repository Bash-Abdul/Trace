import { afterEach, describe, expect, it, vi } from 'vitest';
import { authRequest } from './auth-api';

afterEach(() => vi.unstubAllGlobals());
describe('auth endpoint errors', () => {
  it('identifies a local origin mismatch instead of suggesting a page refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: { code: 'ORIGIN_INVALID' } }, { status: 403 })),
    );
    await expect(
      authRequest('/verify-email', { method: 'POST', body: { token: 'invalid' } }),
    ).rejects.toThrow('different browser address');
  });
  it('does not call a missing signup route a missing session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Not found</html>', { status: 404 })),
    );
    await expect(
      authRequest('/register', {
        method: 'POST',
        body: { email: 'test@example.com', password: 'Password123!' },
      }),
    ).rejects.toThrow('authentication service is unavailable');
  });
  it('keeps the specific message for an unavailable session target', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: 'SESSION_NOT_FOUND' } }, { status: 404 }),
        ),
    );
    await expect(
      authRequest('/sessions/example', { method: 'DELETE', csrfToken: 'test' }),
    ).rejects.toThrow('This session is no longer available');
  });
  it('treats a missing session endpoint as an unavailable service', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: { code: 'ROUTE_NOT_FOUND' } }, { status: 404 })),
    );
    await expect(authRequest('/sessions/example', { method: 'DELETE' })).rejects.toThrow(
      'authentication service is unavailable',
    );
  });
});
