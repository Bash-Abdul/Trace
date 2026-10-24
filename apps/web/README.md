# Trace web

The signed-in Trace workspace uses React, TypeScript, Vite, React Router, Lucide icons,
and locally bundled DM Sans / Newsreader fonts. The original sample layout now reads
real API data for connected features, with labelled demo previews for unfinished features.

Run from the repository root (separate terminals for API and web):

```sh
pnpm dev:db
pnpm dev:api
pnpm dev:web
```

Open http://localhost:5173 and sign in. `/overview` shows real project counts;
`/projects` supports search, filtering, creation and project details. `/reviews`
combines proposal reviews, milestone reviews and unresolved milestone feedback,
with attention/type/involvement filters for Authors and Reviewers. Open a project's milestone for
text/link drafts, submissions, decisions and feedback. Old `/workspace` URLs redirect
to the matching integrated routes. `/account` manages sessions; `/settings` retains the demo settings.

## Architecture

- `src/app`: authenticated routing, responsive sidebar shell and shared styles.
- `src/modules/auth`: cookie-session state, auth forms and account/session management.
- `src/modules/projects`: API-backed project list, cards and list-loading hook.
- `src/modules/dashboard`: overview derived from project summaries and the review queue.
- `src/modules/reviews`: shared live queue API, refresh hook and filtered review page.
- `src/modules/workspace`: existing project creation, brief, proposal, membership and invitation components, plus the shared typed project API client.
- `src/modules/milestones`: evidence editor, immutable submission history, Reviewer decisions and feedback.
- `src/shared/ui`: reusable visual components.

`WorkspaceViewProvider` shares the live project list, review queue and Author/Reviewer presentation.
Reviewer-only accounts default to the review desk. The top bar is a fixed view label,
not a role switch. Mixed-role accounts use Review & feedback for assigned work;
project pages derive the label from their actual membership role.
The existing layout, four overview cards, illustration, activity and upcoming panels,
portfolio preview and navigation are retained.

`DemoProvider` remains mounted for unfinished features. Sample projects and their
milestone/portfolio pages use `/demo/projects/...`; they are labelled Demo preview.
Demo actions only update browser storage, while `/projects/...` actions use the API.
Portfolio, activity, demo feedback and settings remain explorable rather than being
replaced with placeholders. Existing CSRF/session protections apply to live mutations.

Creation supports editable template copies and a Custom structure option. Milestones
and deliverables have stable editable rows with reorder and required/optional controls.
Proposal feedback is shown in Overview → Proposal history & feedback. The Milestone
feedback tab leads to version-specific feedback inside each milestone.

## Current limits

Live project lists and counts cover at most 100 recently updated projects. The
approved-milestone total, upcoming schedule and global activity remain
explicitly labelled sample data. Review and unresolved-feedback counts are live,
bounded to 200 recent items per queue type with a truncation notice. The queue
refreshes on navigation, focus and every 30 seconds while visible; it has no
read/unread notification history. The original sample review page is at `/demo/reviews`.
Live project tabs restore Overview, Milestones, Evidence, Feedback, Activity and Team;
evidence and feedback tabs link to the live milestone workflows.

File/image uploads (#2), invitation email delivery (#3), and app-wide notifications
(#4) remain follow-ups. Invitation links are shared manually; registration/recovery
emails still require the email worker (#1). No database migration is needed.

## Checks

```sh
pnpm --filter @trace/web typecheck
pnpm --filter @trace/web lint
pnpm --filter @trace/web test
pnpm --filter @trace/web build
pnpm --filter @trace/web test:e2e
```

Browser tests use Playwright Chromium (`pnpm --filter @trace/web exec playwright install chromium` if needed), start a local Vite server, and cover API-backed lists, empty/error states, session expiry, redirects and mobile navigation. No production accounts or services are needed.

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

Sign in, then choose **Open my projects** on `/account`, or visit `/projects`.
Run `pnpm db:migrate` once for the new project tables. Individual projects invite
a Reviewer; group leads can also invite Authors. Copy and share the generated
invitation link yourself; no invitation email is sent. Recipients sign in with
the verified invited email and accept the link. Proposal submission, revision
requests and approval are real persisted workflows. External approval activates
automatically when the initial Author/lead and Reviewer have joined.

The real API browser suite covers group creation, invitation acceptance, shared
draft editing, proposal revision/approval, and milestone submission, revision,
feedback resolution and approval through the integrated layout.
