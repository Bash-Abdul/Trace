# Trace web

A working authentication frontend and clickable, responsive visual prototype of the Author / main Reviewer workflow described in `../api/docs/backend-engineering-plan.md`. React, TypeScript, Vite, React Router, Lucide icons, and locally bundled DM Sans / Newsreader fonts.

Run from the repository root:

```sh
pnpm install
pnpm dev:web
```

Open http://127.0.0.1:5173 for the public landing page, then enter the demo at `/overview`. Choose Author or Reviewer in the workspace top bar. Explore project creation, invitation acceptance, proposal approval, draft evidence, milestone submission and revisions, feedback resolution, final approval, and printable process portfolios. Settings can restore the original fictional projects.

## Architecture

- `src/app`: routing, application shell, demo state provider, global styles.
- `src/modules/auth`: API client, in-memory cookie-session state, auth forms, protected account and session management.
- `src/modules/landing`: responsive public landing page and product previews.
- `src/modules/dashboard`: workspace overview.
- `src/modules/projects`: project pages/components, typed domain model, fixtures, and pure workflow transitions.
- `src/modules/submissions`: milestone editor, evidence previews, version history.
- `src/modules/feedback`: conversations and review queue.
- `src/modules/activity`: shared activity timeline.
- `src/modules/portfolio`: live / completed record and print layout.
- `src/modules/settings`: demo data controls.
- `src/shared/ui`: reusable visual primitives.

`DemoProvider` is the mock data boundary. Components use its typed operations; workflow rules live in `projects/model/workflow.ts`. Local storage is schema-validated and uses the single key `trace.visual-demo.v1`. Backend integration should replace this boundary with server-backed queries/mutations and enforce permissions on the server.

## Scope and deliberate limitations

Project pages remain fictional browser data. The persona selector is a demonstration control, not authorization. Evidence documents and final deliverables are samples; no files are uploaded. External evidence links open only HTTP(S) URLs. Authentication pages make real API requests; registration and recovery enqueue email jobs. The sample workspace stays public and is separate from the protected `/account` page.

The four template labels are illustrative: the plan does not specify their final names. The invitation flow simulates one fixed Reviewer. Proposal editing, real project persistence, membership/succession management, and actual uploads remain integration work. Completed demo projects are locked, preserving their final record in browser storage; production snapshots need durable server storage. Browser reset clears this demo's projects, including completed records.

Milestone counts are shown instead of an invented combined project percentage. Author-addressed feedback remains unresolved until the Reviewer resolves it. Submitted evidence is copied into version history; revisions start a new version.

## Checks

```sh
pnpm --filter @trace/web typecheck
pnpm --filter @trace/web lint
pnpm --filter @trace/web test
pnpm --filter @trace/web build
pnpm --filter @trace/web test:e2e
```

Browser tests use Playwright Chromium (`pnpm --filter @trace/web exec playwright install chromium` if needed), start a local Vite server, and cover the interactive workflow and mobile navigation. No production accounts or services are needed.

## Real authentication

Public routes: `/login`, `/register`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`. `/account` restores the current session and requires sign-in; it lists active sessions and supports current, individual, and account-wide sign-out.

Start your development PostgreSQL instance and apply migrations using the API setup instructions. Keep your existing `apps/api/.env` and encryption key. In separate terminals from the repository root:

```sh
# Set APP_ORIGIN in apps/api/.env to the frontend address you use.
pnpm dev:api
pnpm dev:web
```

For the current local setup, open **http://localhost:5173/login** and set `APP_ORIGIN=http://localhost:5173` in the local API environment. `localhost` and `127.0.0.1` are different origins. The development API reloads when `.env` changes and reads that file as its source of configuration. Vite proxies `/api` to port 3001 without rewriting Origin. `TRACE_API_TARGET` overrides the development proxy target if required. No credentialed CORS is needed.

The frontend never stores passwords, session credentials, or CSRF tokens in local/session storage. Session cookies remain HttpOnly. CSRF tokens exist only in memory and are restored using GET `/session`. Protected mutations send `X-CSRF-Token`. A 401 clears local account state; network/server errors remain retryable errors rather than being treated as successful sign-out. The frontend route guard is UI behavior; the API remains the authorization authority.

Email verification/reset links use `/verify-email#token=...` and `/reset-password#token=...`. The fragment is captured in memory and removed from the address bar; only a deliberate form submission consumes it. Refreshing the action page requires reopening the email link. Passwords follow the backend’s 8–32 character policy and are never trimmed.

For actual email delivery, configure the API email worker with your verified sender and HTTPS frontend URLs ending in `/verify-email` and `/reset-password`, then run `pnpm worker:email`. In explicit `NODE_ENV=development`, the worker also accepts HTTP links on `localhost`, `127.0.0.1`, and `[::1]`. Use the same hostname as `APP_ORIGIN`. Production and test mode still require HTTPS. Keep provider credentials in the ignored API environment file.

In production, serve `/api` and the SPA under the same HTTPS origin; route API requests before the SPA fallback and set `APP_ORIGIN` to that origin. Vite's development proxy is not production infrastructure. Do not cache auth responses.

## Auth verification

`test:e2e` includes controlled API responses for expired links, generic registration responses, rate limits, session restoration, CSRF headers, and mobile forms. To run the separate real API/browser suite, use an isolated PostgreSQL database whose name ends in `_test` and a disposable test encryption key:

```sh
export TEST_DATABASE_URL=postgresql://USER@127.0.0.1:5432/trace_web_auth_test
export OUTBOX_ENCRYPTION_KEY=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=
pnpm --filter @trace/api db:migrate:test
pnpm --filter @trace/web test:e2e:live
```

The live suite starts dedicated servers on ports 3100 and 5174, refuses to reuse existing servers, reads only its generated account's encrypted email tokens directly from the test database, and never starts the email worker. It exercises registration, verification, cookie restoration, individual session revocation, password reset, rejection of the old password, and revocation of all sessions. Traces are disabled for this suite to avoid recording action credentials. Chromium needs its normal OS libraries installed; they were supplied from temporary extracted packages during verification on this machine.

For this machine’s current local setup, open `http://localhost:5173` and use `APP_ORIGIN=http://localhost:5173`, `PORT=3001`, `EMAIL_VERIFICATION_URL=http://localhost:5173/verify-email`, and `EMAIL_PASSWORD_RESET_URL=http://localhost:5173/reset-password`. Restart the API after changing `.env`. With Resend’s `onboarding@resend.dev` test sender, the signup recipient must be the same email address as your Resend account. Other recipients require a verified sending domain. After signup or requesting another verification email, run `pnpm worker:email`; each invocation drains currently eligible queued jobs and exits.

## Real project workspace

Sign in, then choose **Open my projects** on `/account`, or visit `/workspace`.
Run `pnpm db:migrate` once for the new project tables. Individual projects invite
a Reviewer; group leads can also invite Authors. Copy and share the generated
invitation link yourself; no invitation email is sent. Recipients sign in with
the verified invited email and accept the link. Proposal submission, revision
requests and approval are real persisted workflows. External approval activates
automatically when the initial Author/lead and Reviewer have joined.

The public sample workspace remains at `/overview`; it is separate from your
real account data. Real milestone evidence/submissions are the next phase.
