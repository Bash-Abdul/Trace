import { z } from 'zod';
import type { EmailVerificationJobPayload } from './outbox-payload.js';

import type { VerificationEmailProvider } from './outbox-worker.js';

const frontendUrl = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    const localHttp =
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (
      (url.protocol === 'https:' || localHttp) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, 'Use HTTPS or a development loopback URL without credentials, query, or fragment');
const emailConfiguration = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    RESEND_API_KEY: z.string().trim().min(1),
    EMAIL_FROM: z.string().email(),
    EMAIL_VERIFICATION_URL: frontendUrl,
    EMAIL_PASSWORD_RESET_URL: frontendUrl,
  })
  .superRefine((config, context) => {
    for (const field of ['EMAIL_VERIFICATION_URL', 'EMAIL_PASSWORD_RESET_URL'] as const) {
      if (
        URL.canParse(config[field]) &&
        config.NODE_ENV !== 'development' &&
        new URL(config[field]).protocol !== 'https:'
      ) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'HTTPS is required outside development',
        });
      }
    }
  });

export class EmailConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super(`Set valid email configuration for: ${fields.join(', ')}`);
  }
}

export function createResendEmailProvider(
  input: NodeJS.ProcessEnv,
  sendRequest: typeof fetch = fetch,
): VerificationEmailProvider {
  const result = emailConfiguration.safeParse(input);
  if (!result.success) {
    // Do not include configuration values (especially credentials) in errors.
    throw new EmailConfigurationError([
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ]);
  }
  const config = result.data;
  async function send(
    payload: EmailVerificationJobPayload,
    idempotencyKey: string,
    reset: boolean,
  ) {
    const url = new URL(reset ? config.EMAIL_PASSWORD_RESET_URL : config.EMAIL_VERIFICATION_URL);
    // A fragment keeps the token out of HTTP access logs. The frontend
    // reads it and POST it to the verification endpoint.
    url.hash = new URLSearchParams({ token: payload.verificationToken }).toString();
    const response = await sendRequest('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [payload.recipientEmail],
        subject: reset ? 'Reset your Trace password' : 'Verify your Trace email',
        text: `${reset ? 'Reset your Trace password' : 'Verify your email to continue with Trace'}:\n\n${url.toString()}\n\nThis link expires ${reset ? '30 minutes' : '24 hours'} after it was requested. If you did not request it, ignore this email.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // Discard provider response content without logging sensitive details.
    await response.body?.cancel();
    if (!response.ok) throw new Error('Email provider rejected delivery');
  }
  return {
    sendVerification: (payload, key) => send(payload, key, false),
    sendPasswordReset: (payload, key) => send(payload, key, true),
  };
}
