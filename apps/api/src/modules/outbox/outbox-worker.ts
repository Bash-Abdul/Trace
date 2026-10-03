import {
  decryptEmailVerificationPayload,
  type EmailVerificationJobPayload,
} from './outbox-payload.js';
import type { createOutboxWorkerRepository } from './outbox-worker.repository.js';

export interface VerificationEmailProvider {
  // Implementations must bound delivery time below the 60-second job lease.
  sendPasswordReset(payload: EmailVerificationJobPayload, idempotencyKey: string): Promise<void>;
  sendVerification(payload: EmailVerificationJobPayload, idempotencyKey: string): Promise<void>;
}

export async function processNextEmail(
  repository: ReturnType<typeof createOutboxWorkerRepository>,
  provider: VerificationEmailProvider,
  workerId: string,
): Promise<'idle' | 'completed' | 'retry-or-failed' | 'lease-lost'> {
  const job = await repository.claim(workerId);
  if (!job) return 'idle';

  let succeeded = false;
  try {
    const payload = decryptEmailVerificationPayload(job.encrypted_payload, job.job_type);
    if (!(await repository.shouldSend(job, payload))) {
      return (await repository.settle(job, workerId, true)) ? 'completed' : 'lease-lost';
    }
    if (job.job_type === 'SEND_PASSWORD_RESET') {
      await provider.sendPasswordReset(payload, job.idempotency_key);
    } else {
      await provider.sendVerification(payload, job.idempotency_key);
    }
    succeeded = true;
  } catch {
    // Provider errors may contain email addresses, tokens, or request bodies.
    // Persist only a fixed safe summary; never log the original error here.
  }

  const settled = await repository.settle(job, workerId, succeeded);
  if (!settled) return 'lease-lost';
  return succeeded ? 'completed' : 'retry-or-failed';
}
