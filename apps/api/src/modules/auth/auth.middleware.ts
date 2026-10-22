import { createHmac } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pool, withTransaction } from '../../config/db.js';
import { env } from '../../config/index.js';
import { AppError, forbidden } from '../../utils/app-error.js';
import { audit, readSession, withSession } from './auth.service.js';
import { readSessionCookie } from './auth-policy.js';
import type { AuthenticatedHandler, MutationHandler } from './auth.types.js';
import { rateLimitBodySchema } from './auth.schema.js';

export const authBrowserControls: RequestHandler = (request, response, next) => {
  response.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  if (env.NODE_ENV === 'production') {
    response.set('Strict-Transport-Security', 'max-age=31536000');
  }
  const origin = request.get('origin');
  const referer = request.get('referer');
  let refererOrigin: string | undefined;
  try {
    refererOrigin = referer ? new URL(referer).origin : undefined;
  } catch {
    return next(forbidden('Invalid request origin'));
  }
  if (
    (origin && origin !== env.APP_ORIGIN) ||
    (!origin && refererOrigin && refererOrigin !== env.APP_ORIGIN) ||
    request.get('sec-fetch-site') === 'cross-site'
  ) {
    return next(forbidden('Untrusted request origin', 'ORIGIN_INVALID'));
  }
  next();
};

export const authRateLimit: RequestHandler = async (request, response, next) => {
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return next();
  }
  const parsedBody = rateLimitBodySchema.safeParse(request.body);
  const email = parsedBody.success ? parsedBody.data.email : null;
  const keys = [{ value: `network:${request.ip ?? 'unknown'}`, limit: 100 }];
  if (email) {
    keys.push({
      value: `account:${request.path.toLowerCase().replace(/\/+$/, '')}:${email}`,
      limit: 10,
    });
  }
  const denied = await withTransaction(async (client) => {
    let limited = false;
    for (const key of keys) {
      const digest = createHmac('sha256', Buffer.from(env.OUTBOX_ENCRYPTION_KEY, 'base64'))
        .update(`trace:rate:${key.value}`)
        .digest('hex');
      const result = await client.query<{ attempts: number }>(
        `INSERT INTO auth_rate_limits (key, attempts, expires_at)
        VALUES ($1, 1, now() + interval '15 minutes')
        ON CONFLICT (key) DO UPDATE SET
          attempts = CASE
            WHEN auth_rate_limits.expires_at <= now() THEN 1
            ELSE auth_rate_limits.attempts + 1
          END,
          expires_at = CASE
            WHEN auth_rate_limits.expires_at <= now() THEN now() + interval '15 minutes'
            ELSE auth_rate_limits.expires_at
          END
        RETURNING attempts`,
        [digest],
      );
      const attempts = result.rows[0]!.attempts;
      if (attempts > key.limit) {
        limited = true;
      }
      if (attempts === key.limit + 1) {
        await audit(client, 'AUTH_RATE_LIMITED', null);
      }
      if (limited) {
        break;
      }
    }
    return limited;
  });
  if (denied) {
    response.set('Retry-After', '900');
    return next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.'));
  }
  next();
};

export const requireMutationOrigin: RequestHandler = (request, _response, next) => {
  // Authenticated mutations require positive origin evidence in addition to CSRF.
  if (!request.get('origin') && !request.get('referer')) {
    return next(forbidden('Origin required', 'ORIGIN_REQUIRED'));
  }
  next();
};

// Controllers return an HTTP result instead of sending during a transaction.
// In particular, a successful response must never escape before COMMIT succeeds.
export function authenticateRead<Params, Body, Result>(
  handler: AuthenticatedHandler<Params, Body, Result>,
): RequestHandler<Params, Result, Body> {
  return async (request, response): Promise<void> => {
    const session = await readSession(readSessionCookie(request.headers.cookie));
    const result = await handler(request, {
      userId: session.user_id,
      sessionId: session.id,
      db: pool,
    });
    if (result.status === 204) {
      response.status(204).end();
    } else {
      response.status(result.status).json(result.body);
    }
  };
}

export function authenticateMutation<Params, Body, Result>(
  handler: MutationHandler<Params, Body, Result>,
): RequestHandler<Params, Result, Body> {
  return async (request, response): Promise<void> => {
    const result = await withSession(
      readSessionCookie(request.headers.cookie),
      request.get('x-csrf-token') ?? '',
      (client, session) =>
        handler(request, { userId: session.user_id, sessionId: session.id, db: client }),
    );
    if (result.status === 204) {
      response.status(204).end();
    } else {
      response.status(result.status).json(result.body);
    }
  };
}
