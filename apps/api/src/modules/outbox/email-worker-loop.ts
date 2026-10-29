import { setTimeout as delay } from 'node:timers/promises';
import type { processNextEmail } from './outbox-worker.js';

type Outcome = Awaited<ReturnType<typeof processNextEmail>>;
export async function waitForEmailWork(ms: number, signal: AbortSignal): Promise<void> {
  try {
    await delay(ms, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

// One attempt at a time; the repository remains responsible for leases and job retries.
export async function runEmailWorkerLoop({
  signal,
  processNext,
  cleanup,
  report,
  sleep = waitForEmailWork,
  now = Date.now,
}: {
  signal: AbortSignal;
  processNext: () => Promise<Outcome>;
  cleanup: () => Promise<void>;
  report: (event: Outcome | 'infrastructure-error', retryMs?: number) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}): Promise<void> {
  let nextCleanup = 0;
  let retryMs = 3000;
  while (!signal.aborted) {
    try {
      if (now() >= nextCleanup) {
        await cleanup();
        nextCleanup = now() + 300_000;
      }
      if (signal.aborted) break;
      const outcome = await processNext();
      retryMs = 3000;
      if (outcome !== 'idle') report(outcome);
      if (outcome === 'idle' && !signal.aborted) await sleep(3000, signal);
    } catch {
      // Database/provider errors can contain credentials or payloads. Never pass them to logs.
      if (signal.aborted) break;
      report('infrastructure-error', retryMs);
      await sleep(retryMs, signal);
      retryMs = Math.min(retryMs * 2, 30_000);
    }
  }
}
