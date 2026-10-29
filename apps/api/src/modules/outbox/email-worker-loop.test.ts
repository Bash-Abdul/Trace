import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEmailWorkerLoop } from './email-worker-loop.js';
import { processNextEmail } from './outbox-worker.js';
import { encryptEmailVerificationPayload } from './outbox-payload.js';

vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number, _value: unknown, { signal }: { signal: AbortSignal }) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    }),
}));
afterEach(() => vi.useRealTimers());
function fixture() {
  const controller = new AbortController();
  const job = {
    id: 'job',
    job_type: 'SEND_EMAIL_VERIFICATION' as const,
    encrypted_payload: encryptEmailVerificationPayload({
      recipientEmail: 'test@example.com',
      verificationToken: 'test-token',
    }),
    idempotency_key: 'stable-job',
    attempt_count: 1,
  };
  const repository = {
    claim: vi.fn().mockResolvedValue(null),
    shouldSend: vi.fn().mockResolvedValue(true),
    settle: vi.fn().mockResolvedValue(true),
  };
  const provider = {
    sendVerification: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  };
  const cleanup = vi.fn().mockResolvedValue(undefined);
  const report = vi.fn();
  return {
    controller,
    job,
    repository,
    provider,
    cleanup,
    report,
    start: () =>
      runEmailWorkerLoop({
        signal: controller.signal,
        processNext: () => processNextEmail(repository, provider, 'worker'),
        cleanup,
        report,
      }),
  };
}
describe('persistent email loop', () => {
  it('stays alive while idle and processes work queued later without batch delays', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const finished = vi.fn();
    const run = f.start().then(finished);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.repository.claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2999);
    expect(f.repository.claim).toHaveBeenCalledTimes(1);
    expect(finished).not.toHaveBeenCalled();
    f.repository.claim.mockResolvedValueOnce(f.job).mockResolvedValueOnce({ ...f.job, id: 'job2' });
    await vi.advanceTimersByTimeAsync(1);
    expect(f.provider.sendVerification).toHaveBeenCalledTimes(2);
    expect(f.repository.settle).toHaveBeenCalledTimes(2);
    expect(f.repository.claim).toHaveBeenCalledTimes(4);
    expect(f.cleanup).toHaveBeenCalledTimes(1);
    f.controller.abort();
    await run;
    expect(finished).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.repository.claim).toHaveBeenCalledTimes(4);
  });
  it('backs off infrastructure failures up to 30 seconds and resets after recovery', async () => {
    const f = fixture();
    f.repository.claim.mockRejectedValue(new Error('sensitive database error'));
    const delays: number[] = [];
    await runEmailWorkerLoop({
      signal: f.controller.signal,
      processNext: () => processNextEmail(f.repository, f.provider, 'worker'),
      cleanup: f.cleanup,
      report: f.report,
      sleep: (ms) => {
        delays.push(ms);
        if (delays.length === 6) f.repository.claim.mockResolvedValue(null);
        if (delays.length === 7) f.controller.abort();
        return Promise.resolve();
      },
    });
    expect(delays).toEqual([3000, 6000, 12000, 24000, 30000, 30000, 3000]);
    expect(JSON.stringify(f.report.mock.calls)).not.toContain('sensitive');
  });
  it('recovers from housekeeping failure and does not perform cleanup on every poll', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.cleanup.mockRejectedValueOnce(new Error('offline'));
    const run = f.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.repository.claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.cleanup).toHaveBeenCalledTimes(2);
    f.controller.abort();
    await run;
  });
  it('finishes an in-flight send and settlement on shutdown without claiming another job', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.repository.claim.mockResolvedValue(f.job);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.provider.sendVerification.mockReturnValue(pending);
    const run = f.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.provider.sendVerification).toHaveBeenCalledTimes(1);
    f.controller.abort();
    expect(f.repository.settle).not.toHaveBeenCalled();
    finish();
    await run;
    expect(f.repository.settle).toHaveBeenCalledWith(f.job, 'worker', true);
    expect(f.repository.claim).toHaveBeenCalledTimes(1);
  });
  it('settles provider failures through the existing retry policy and continues', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.repository.claim.mockResolvedValueOnce(f.job);
    f.provider.sendVerification.mockRejectedValueOnce(new Error('secret provider response'));
    const run = f.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.repository.settle).toHaveBeenCalledWith(f.job, 'worker', false);
    expect(f.report).toHaveBeenCalledWith('retry-or-failed');
    f.repository.claim.mockResolvedValueOnce({ ...f.job, attempt_count: 2 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(f.repository.settle).toHaveBeenLastCalledWith(
      { ...f.job, attempt_count: 2 },
      'worker',
      true,
    );
    f.controller.abort();
    await run;
  });
  it('does not claim work if shutdown begins during cleanup', async () => {
    const f = fixture();
    f.cleanup.mockImplementation(() => {
      f.controller.abort();
      return Promise.resolve();
    });
    await f.start();
    expect(f.repository.claim).not.toHaveBeenCalled();
  });
});
