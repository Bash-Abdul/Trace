import { z } from 'zod';
import type { EmailVerificationJobPayload } from './outbox-payload.js';

import type { VerificationEmailProvider } from './outbox-worker.js';

const frontendUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  }, 'Use an HTTPS frontend URL without credentials, query, or fragment');
const emailConfiguration = z.object({
  RESEND_API_KEY: z.string().trim().min(1),
  EMAIL_FROM: z.string().email(),
  EMAIL_VERIFICATION_URL: frontendUrl,
  EMAIL_PASSWORD_RESET_URL: frontendUrl,
});

export function createResendEmailProvider(
  input: NodeJS.ProcessEnv,
  sendRequest: typeof fetch = fetch,
): VerificationEmailProvider {
  const result = emailConfiguration.safeParse(input);
  if (!result.success) {
    // Do not include configuration values (especially credentials) in errors.
    throw new Error(
      'Set RESEND_API_KEY, EMAIL_FROM, and valid HTTPS EMAIL_VERIFICATION_URL / EMAIL_PASSWORD_RESET_URL',
    );
  }
  const config = result.data;
  async function send(
    payload: EmailVerificationJobPayload,
    idempotencyKey: string,
    reset: boolean,
  ) {
    const url = new URL(reset ? config.EMAIL_PASSWORD_RESET_URL : config.EMAIL_VERIFICATION_URL);
    // A fragment keeps the token out of HTTP access logs. The future frontend
    // will read it and POST it to the verification endpoint.
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
