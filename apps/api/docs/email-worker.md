# Persistent email worker

Run one separate, always-on Railway service using the same release as the API:

- Build from the repository root: `pnpm --filter @trace/api build`.
- Start from the repository root: `node apps/api/dist/email-worker.js`.
- Remove the service's Cron Schedule. Do not run both the old cron and the persistent service.
- Remove any HTTP healthcheck path. No public domain, HTTP listener or port is needed.
- Disable service sleeping/serverless mode for this worker and retain an on-failure restart policy.
- Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=60` on the worker service so its 45-second
  shutdown deadline can run before Railway sends SIGKILL.
- Keep `DATABASE_URL`, `OUTBOX_ENCRYPTION_KEY` (identical to the API), `NODE_ENV=production`,
  `APP_ORIGIN`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_VERIFICATION_URL` and
  `EMAIL_PASSWORD_RESET_URL` configured. The existing shared environment validation still applies.
  Never regenerate the encryption key as part of this deployment: queued payloads need it.

Railway settings must be changed in the worker service; this repository change does not remove
an existing Railway cron schedule automatically. See Railway's [worker guidance](https://docs.railway.com/guides/cron-workers-queues)
and [deployment draining documentation](https://docs.railway.com/deployments/deployment-teardown).

## Runtime

The worker processes one attempt at a time and immediately asks for more work after settlement.
An empty queue waits three seconds. Infrastructure failures use 3/6/12/24/30-second capped
backoff, reset by a successful iteration. Failed email delivery still uses the existing durable
outbox retry schedule and five-attempt limit. Authentication token checks, purpose-bound encryption,
atomic SKIP LOCKED claims, 60-second leases, attempt fencing and provider idempotency keys are unchanged.
This remains at-least-once delivery: provider acceptance followed by a database failure can cause
another attempt, using the same provider idempotency key. It is not a new exactly-once guarantee.

The worker owns a single-connection pool with a five-second connection/server-statement timeout
and ten-second client query timeout. Resend retains its 15-second timeout. Idle connection errors
are handled without logging raw database errors. Housekeeping removes at most 1,000 expired rate
limit buckets on startup and every five minutes; it never deletes account or outbox history.

SIGINT/SIGTERM interrupt idle/backoff waits and stop further processing iterations. A claim already
in flight may complete; that attempt is allowed to settle before closing the pool. A repeated signal
does not bypass draining. At 45 seconds the process exits with failure if stuck; the database lease
then makes unfinished work recoverable. Normal shutdown closes the pool and exits successfully.
Logs contain lifecycle messages, outcomes and retry delays, never payloads or raw provider errors.

For local development, `pnpm worker:email` now stays running until Ctrl+C. The HTTP API remains
independent. Check for `Email worker started`, processing outcomes and `Email worker stopped` in
service logs; an empty queue is intentionally quiet. Validate real delivery with a deliberate
signup/reset after deployment, not by exposing an HTTP health endpoint.

## Verification

`pnpm verify` passes formatting, lint, type checking, 67 API unit tests, 101 database integration
tests, 8 web unit tests and both builds. Six loop regressions cover idle persistence, newly queued
work, bounded infrastructure backoff, housekeeping recovery, in-flight shutdown and delivery retries.
Existing database tests still verify concurrent claims, lease expiry, fencing and exhausted retries.
The compiled entry point was smoke-tested with both SIGTERM and SIGINT during database-failure
backoff: both closed resources and exited with code 0. No real emails were sent.
The high-severity dependency audit passes with five moderate advisories remaining.
