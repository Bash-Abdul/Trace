import { describe, expect, it, vi } from 'vitest';

import { encryptEmailVerificationPayload } from './outbox-payload.js';
import { processNextEmail } from './outbox-worker.js';
import { createResendEmailProvider } from './resend-email-provider.js';

const payload = { recipientEmail: 'author@example.com', verificationToken: 'secret-token' };

function fixture(encrypted = encryptEmailVerificationPayload(payload)) {
  const job = {
    id: 'job',
    job_type: 'SEND_EMAIL_VERIFICATION' as const,
    encrypted_payload: encrypted,
    idempotency_key: 'verification:job',
    attempt_count: 1,
  };
  return {
    job,
    repository: {
      claim: vi.fn().mockResolvedValue(job),
      shouldSend: vi.fn().mockResolvedValue(true),
      settle: vi.fn().mockResolvedValue(true),
    },
    provider: {
      sendPasswordReset: vi.fn().mockResolvedValue(undefined),
      sendVerification: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('email processing', () => {
  it('decrypts the payload and uses a stable provider idempotency key', async () => {
    const { job, repository, provider } = fixture();
    expect(await processNextEmail(repository, provider, 'worker')).toBe('completed');
    expect(provider.sendVerification).toHaveBeenCalledWith(payload, job.idempotency_key);
    expect(repository.settle).toHaveBeenCalledWith(job, 'worker', true);
  });
  it('skips obsolete tokens without sending an email', async () => {
    const { repository, provider } = fixture();
    repository.shouldSend.mockResolvedValue(false);
    expect(await processNextEmail(repository, provider, 'worker')).toBe('completed');
    expect(provider.sendVerification).not.toHaveBeenCalled();
  });
  it('dispatches password-reset jobs using their purpose-bound encryption', async () => {
    const { job, repository, provider } = fixture();
    repository.claim.mockResolvedValue({
      ...job,
      job_type: 'SEND_PASSWORD_RESET',
      encrypted_payload: encryptEmailVerificationPayload(payload, 'SEND_PASSWORD_RESET'),
    });
    expect(await processNextEmail(repository, provider, 'worker')).toBe('completed');
    expect(provider.sendPasswordReset).toHaveBeenCalledWith(payload, job.idempotency_key);
    expect(provider.sendVerification).not.toHaveBeenCalled();
  });
  it('retries provider failures without passing secret error details to persistence', async () => {
    const { job, repository, provider } = fixture();
    provider.sendVerification.mockRejectedValue(new Error('secret-token'));
    expect(await processNextEmail(repository, provider, 'worker')).toBe('retry-or-failed');
    expect(repository.settle).toHaveBeenCalledWith(job, 'worker', false);
  });
  it('does not send corrupt encrypted payloads', async () => {
    const { repository, provider } = fixture('corrupt');
    expect(await processNextEmail(repository, provider, 'worker')).toBe('retry-or-failed');
    expect(provider.sendVerification).not.toHaveBeenCalled();
  });
  it('reports a lost lease without pretending delivery was persisted', async () => {
    const { repository, provider } = fixture();
    repository.settle.mockResolvedValue(false);
    expect(await processNextEmail(repository, provider, 'worker')).toBe('lease-lost');
  });
});

describe('Resend adapter', () => {
  const config = {
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'trace@example.com',
    EMAIL_VERIFICATION_URL: 'https://trace.example/verify-email',
    EMAIL_PASSWORD_RESET_URL: 'https://trace.example/reset-password',
  };
  it('sends a fragment-based verification link with a timeout and idempotency header', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await createResendEmailProvider(config, transport).sendVerification(payload, 'stable-key');
    const [url, request] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(request?.headers).toMatchObject({ 'Idempotency-Key': 'stable-key' });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(request!.body as string)).toMatchObject({ to: [payload.recipientEmail] });
    expect(request?.body).toContain('https://trace.example/verify-email#token=secret-token');
  });
  it('rejects provider errors without exposing their response bodies', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret-token', { status: 429 }));
    await expect(
      createResendEmailProvider(config, transport).sendVerification(payload, 'key'),
    ).rejects.toThrow('Email provider rejected delivery');
  });
  it('rejects missing credentials and unsafe verification URLs', () => {
    expect(() => createResendEmailProvider({})).toThrow('Set RESEND_API_KEY');
    expect(() =>
      createResendEmailProvider({ ...config, EMAIL_VERIFICATION_URL: 'http://example.com' }),
    ).toThrow();
  });
});
