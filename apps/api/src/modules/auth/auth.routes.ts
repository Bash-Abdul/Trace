import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../../utils/app-error.js';
import { cookieName, cookieOptions, readSessionCookie, sessionCsrfToken } from './auth-policy.js';
import { requireMutationOrigin } from './auth.middleware.js';
import {
  audit,
  consumeAction,
  login,
  requestAction,
  revokeSession,
  withSession,
} from './auth.service.js';
import { registerSchema } from './register/register.schema.js';

const emailBody = registerSchema.pick({ email: true });
const tokenBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const resetBody = tokenBody.extend({ password: registerSchema.shape.password });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw badRequest('Validation failed', 'VALIDATION_ERROR');
  return result.data;
}
const genericMessage = {
  message: 'If the account is eligible, check your email for instructions.',
};
export const authRouter = Router();

authRouter.post('/verify-email', async (request, response) => {
  const { token } = parse(tokenBody, request.body);
  await consumeAction(token, 'EMAIL_VERIFICATION');
  response.status(204).end();
});
authRouter.post('/resend-verification', async (request, response) => {
  const { email } = parse(emailBody, request.body);
  await requestAction(email, 'EMAIL_VERIFICATION');
  response.status(202).json(genericMessage);
});
authRouter.post('/password-reset/request', async (request, response) => {
  const { email } = parse(emailBody, request.body);
  await requestAction(email, 'PASSWORD_RESET');
  response.status(202).json(genericMessage);
});
authRouter.post('/password-reset/confirm', async (request, response) => {
  const { token, password } = parse(resetBody, request.body);
  await consumeAction(token, 'PASSWORD_RESET', password);
  response.clearCookie(cookieName, cookieOptions).status(204).end();
});
authRouter.post('/login', async (request, response) => {
  const { email, password } = parse(registerSchema, request.body);
  const result = await login(email, password, readSessionCookie(request.headers.cookie));
  response
    .cookie(cookieName, result.rawToken, cookieOptions)
    .json({ user: result.user, sessionId: result.sessionId, csrfToken: result.csrfToken });
});
authRouter.get('/session', async (request, response) => {
  const raw = readSessionCookie(request.headers.cookie);
  const result = await withSession(raw, undefined, async (client, session) => {
    const user = await client.query<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE id = $1',
      [session.user_id],
    );
    return { user: user.rows[0], sessionId: session.id, csrfToken: sessionCsrfToken(raw!) };
  });
  response.json(result);
});
authRouter.get('/sessions', async (request, response) => {
  const sessions = await withSession(
    readSessionCookie(request.headers.cookie),
    undefined,
    async (client, session) => {
      const result = await client.query<{
        id: string;
        created_at: Date;
        last_used_at: Date;
        idle_expires_at: Date;
        absolute_expires_at: Date;
      }>(
        `SELECT id, created_at, last_used_at, idle_expires_at, absolute_expires_at FROM auth_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND idle_expires_at > clock_timestamp() AND absolute_expires_at > clock_timestamp()
      ORDER BY created_at DESC`,
        [session.user_id],
      );
      return result.rows.map((row) => ({ ...row, current: row.id === session.id }));
    },
  );
  response.json({ sessions });
});
authRouter.post('/logout', requireMutationOrigin, async (request, response) => {
  await withSession(
    readSessionCookie(request.headers.cookie),
    request.get('x-csrf-token') ?? '',
    async (client, session) => {
      await revokeSession(client, session, session.id);
      await audit(client, 'LOGOUT', session.user_id);
    },
  );
  response.clearCookie(cookieName, cookieOptions).status(204).end();
});
authRouter.post('/sessions/revoke-all', requireMutationOrigin, async (request, response) => {
  await withSession(
    readSessionCookie(request.headers.cookie),
    request.get('x-csrf-token') ?? '',
    async (client, session) => {
      await revokeSession(client, session, 'all');
    },
  );
  response.clearCookie(cookieName, cookieOptions).status(204).end();
});
authRouter.delete('/sessions/:id', requireMutationOrigin, async (request, response) => {
  const id = parse(z.string().uuid(), request.params.id);
  const current = await withSession(
    readSessionCookie(request.headers.cookie),
    request.get('x-csrf-token') ?? '',
    async (client, session) => {
      await revokeSession(client, session, id);
      return session.id === id;
    },
  );
  if (current) response.clearCookie(cookieName, cookieOptions);
  response.status(204).end();
});
