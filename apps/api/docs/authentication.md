# Authentication API

Implemented September 18, 2026. The API flow is implemented through account-wide
session revocation. Browser/mobile screens and live email delivery have not been
recovered or implemented in this checkout.

## Setup

1. Apply the new migration with `pnpm db:migrate` against your development database.
   Implementation verification applied it only to the guarded test database.
2. Set `APP_ORIGIN` to the exact frontend origin (no trailing slash). Development
   defaults to `http://localhost:3000`. Production requires an explicit HTTPS origin.
3. For live email, configure `RESEND_API_KEY`, `EMAIL_FROM`,
   `EMAIL_VERIFICATION_URL`, and `EMAIL_PASSWORD_RESET_URL`. Both URLs must be HTTPS
   frontend pages without query strings or fragments; the sender must be verified.
4. Run `pnpm worker:email` to process up to 100 jobs, or invoke the same entry point
   from an external scheduler. Compiled entry point: `node apps/api/dist/email-worker.js`.
   No scheduler is provisioned by this change; the API never sends email on startup.

No secrets were populated and no real emails were sent during implementation.
Do not enable delivery to nonexistent frontend pages.

## Endpoints

All paths below are under `/api/v1/auth`. Declared input bodies are JSON and reject unknown fields.
Email input is trimmed/lowercased. Passwords retain the existing 8–32 character
policy and are never trimmed. Tokens are 43-character base64url strings.

| Method / path | Input | Successful response |
| --- | --- | --- |
| POST `/register` | `{ email, password }` | 202, generic message |
| POST `/verify-email` | `{ token }` | 204 |
| POST `/resend-verification` | `{ email }` | 202, generic message |
| POST `/login` | `{ email, password }` | 200, `{ user: { id, email }, sessionId, csrfToken }`, session cookie |
| GET `/session` | session cookie | 200, `{ user: { id, email }, sessionId, csrfToken }` |
| GET `/sessions` | session cookie | 200, `{ sessions: [...] }`, active owned sessions only |
| POST `/logout` | session cookie, CSRF, origin | 204, revoke current session and clear cookie |
| DELETE `/sessions/:id` | session cookie, CSRF, origin | 204, revoke an owned session; clear cookie if current |
| POST `/sessions/revoke-all` | session cookie, CSRF, origin | 204, revoke all owned sessions including current, clear cookie |
| POST `/password-reset/request` | `{ email }` | 202, generic message |
| POST `/password-reset/confirm` | `{ token, password }` | 204, change password and revoke all sessions, clear cookie |

Errors use the existing `{ error: { code, message, requestId } }` shape. Invalid,
expired, consumed, superseded, and wrong-purpose action tokens return 400.
Unauthenticated/expired/revoked sessions return 401. CSRF/origin failures return
403; an unowned session target returns 404; rate limits return 429 with Retry-After.
Login failures are identical for absent accounts, incorrect passwords, and
unverified accounts. Reset/resend responses do not reveal account eligibility.

The machine-readable contract is [auth.openapi.json](./auth.openapi.json).

## Browser integration

- Prefer serving the frontend and API on the same origin. Credentialed CORS is
  not enabled. A separate frontend origin needs explicit CORS implementation.
- Production uses `__Host-trace-session`: Secure, HttpOnly, Path=/, SameSite=Lax,
  no Domain and no persistent Max-Age. Development uses `trace-session`, with
  Secure enabled when APP_ORIGIN is HTTPS.
- Read `csrfToken` from login or GET `/session`. Send it in `X-CSRF-Token` on
  logout and session revocation. These requests also require a matching Origin
  or Referer. Supplied cross-origin headers and cross-site Fetch Metadata are
  rejected throughout the auth API. JSON-only bodies protect public POST routes
  from form submissions; non-browser public clients may omit origin headers.
- Keep the session token in the HTTP-only cookie; it is never returned in JSON.
- Email links put the action token in `#token=...`, avoiding server access logs.
  The frontend must read the fragment, remove it from the address bar, then POST
  the token in JSON. Do not automatically consume tokens on a GET request.
- Successful reset does not automatically log in or mark an unverified account
  verified. Sign in again with the new password after email verification.
- Auth responses are no-store. Request logging excludes headers, query strings,
  and arbitrary paths; audit records contain event type, account ID, and time.

## Concurrency and security decisions

Account-changing operations lock the user before tokens/sessions. Login verifies
Argon2id outside the transaction and rechecks the credential hash under the user
lock, so a reset racing an old-password login either revokes the newly created
session or prevents its creation. Protected session mutations check authorization
inside that same account-locked transaction.

Verification and reset consumption check expiry at the database clock and consume
once. Reset updates credentials, revokes sessions, and inserts audit events in one
transaction. Resends invalidate previous outstanding tokens for that purpose;
a 60-second cooldown prevents concurrent resends from generating multiple jobs.

Session idle lifetime defaults to 1,800 seconds; absolute lifetime defaults to
604,800 seconds. Configure SESSION_IDLE_SECONDS and SESSION_ABSOLUTE_SECONDS.
Idle refresh never extends the absolute deadline. Deployment-specific durations
and Argon2 cost benchmarking still require review before real users.

CSRF tokens are session-bound HMAC values, domain-separated using the existing
secret key; only their hashes are stored. This permits retrieval after page reload
without storing plaintext CSRF secrets. Key rotation must account for both pending
email ciphertext and active sessions; a versioned key-rotation workflow is not
implemented. Do not replace the encryption key casually.

Persistent fixed-window limits allow 100 mutating auth requests per network and
10 per email/endpoint per 15 minutes. Email/network bucket keys are HMAC-derived.
Throttling is temporary, with no permanent account lockout. Expired bucket cleanup
is bounded to 1,000 rows per worker invocation. Express trust proxy remains off;
configure only explicitly trusted proxies before deployment so client IPs are
accurate and cannot be forged. Infrastructure-level abuse controls remain useful.

## Email delivery limits

Verification links expire after 24 hours; reset links after 30 minutes. Both job
types are encrypted with purpose-bound authenticated encryption. The worker checks
that the token is still active before sending; obsolete jobs finish without a send.
A token may still become invalid after dispatch begins; the consume endpoint always
rechecks validity.

Delivery is at least once, with five attempts, exponential delays, 60-second leases,
and a 15-second provider timeout. Attempts fence stale workers out of job updates.
Resend idempotency keys reduce duplicates but last only 24 hours. Keep sender,
URLs, and message templates stable during retries. Terminal failures remain visible
in outbox_jobs; no operator retry UI is implemented.

Provider reference: https://resend.com/docs/dashboard/emails/idempotency-keys
Security references:
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
