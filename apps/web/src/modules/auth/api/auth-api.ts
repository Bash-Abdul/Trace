import { z } from 'zod';

export const sessionSchema = z.object({
  user: z.object({ id: z.string(), email: z.string().email() }),
  sessionId: z.string(),
  csrfToken: z.string().min(1),
});
export type AuthSession = z.infer<typeof sessionSchema>;
export const sessionsSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      current: z.boolean(),
      created_at: z.string(),
      last_used_at: z.string(),
      idle_expires_at: z.string(),
      absolute_expires_at: z.string(),
    }),
  ),
});
export type SessionRecord = z.infer<typeof sessionsSchema>['sessions'][number];
export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function authRequest(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    csrfToken?: string;
    signal?: AbortSignal;
  } = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/auth${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        ...(options.method && options.method !== 'GET'
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new AuthError(
      0,
      'NETWORK_ERROR',
      'We couldn’t reach Trace. Check your connection and try again.',
    );
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = data?.error?.code ?? 'REQUEST_FAILED';
    let message = 'Something went wrong. Please try again.';
    if (response.status === 401)
      message =
        path === '/login'
          ? 'We couldn’t sign you in. Check your email and password, and make sure your email is verified.'
          : 'Your session has ended. Please sign in again.';
    if (response.status === 400)
      message =
        path === '/verify-email' || path === '/password-reset/confirm'
          ? 'This link is invalid or has expired. Request a new email and use the latest link.'
          : 'Please check the information you entered.';
    if (response.status === 403)
      message =
        code === 'ORIGIN_INVALID' && import.meta.env.DEV
          ? 'The local API is using a different browser address. Restart pnpm dev:api, then reopen the email link.'
          : 'This request couldn’t be verified. Refresh the page and try again.';
    if (response.status === 404)
      message =
        options.method === 'DELETE' &&
        /^\/sessions\/[^/]+$/.test(path) &&
        code !== 'ROUTE_NOT_FOUND'
          ? 'This session is no longer available. Refresh the session list.'
          : 'The Trace authentication service is unavailable. Please try again shortly.';
    if (response.status === 429) {
      const seconds = Number(response.headers.get('Retry-After'));
      message =
        Number.isFinite(seconds) && seconds > 0
          ? `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`
          : 'Too many attempts. Please wait before trying again.';
    }
    if (response.status >= 500)
      message = 'Trace is temporarily unavailable. Please try again shortly.';
    throw new AuthError(response.status, code, message);
  }
  if (response.status === 204) return undefined;
  try {
    return await response.json();
  } catch {
    throw new AuthError(
      502,
      'INVALID_RESPONSE',
      'Trace returned an unexpected response. Please try again.',
    );
  }
}
export function authMessage(error: unknown) {
  return error instanceof AuthError ? error.message : 'Something went wrong. Please try again.';
}
