import { createHmac } from 'node:crypto';
import { env } from '../../config/index.js';

export const cookieName = env.NODE_ENV === 'production' ? '__Host-trace-session' : 'trace-session';
export const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.APP_ORIGIN.startsWith('https:'),
  sameSite: 'lax' as const,
  path: '/',
};

// Reproduce the session's synchronizer token on page reload without storing it raw.
export function sessionCsrfToken(rawSession: string): string {
  return createHmac('sha256', Buffer.from(env.OUTBOX_ENCRYPTION_KEY, 'base64'))
    .update(`trace:csrf:v1:${rawSession}`)
    .digest('base64url');
}

export function readSessionCookie(header: string | undefined): string | null {
  const matches = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
