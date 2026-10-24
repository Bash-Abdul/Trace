# Trace Backend Development Handoff

The [backend engineering plan](./backend-engineering-plan.md) is the authoritative source for product and architecture decisions.

## Restore original project presentation — October 24, 2026

The original demo at `1964b86` is the design reference. Project cards again use its
coloured template icons, progress segments, member avatars and feedback strip.
Project detail uses its heading metadata, numbered objectives, milestone rows and
two-column overview with At a glance, Final deliverables and completion panels.
The existing navigation was left unchanged. Proposal actions retain their existing
permissions; history remains available below the milestone plan with older snapshots
collapsed. Do not replace these layouts with generic form panels when wiring APIs.

List/detail responses now include a read-only `progress` summary: current milestone
states, draft evidence counts, unresolved/blocking thread counts and member identities.
The projection shares the existing membership-filtered query and its snapshot; no
migration or per-card API request is needed. Counts cover all submission versions.
Missing dates are labelled No due date. Final deliverable submission and final
approval remain unavailable, with their original panel placement preserved.

Zod is updated to 4.6.7 and body-parser to 2.4.0 (qs 6.16.1). Fresh package metadata
was needed for the transitive update; no override or audit suppression was added.
`pnpm audit --audit-level=high` now passes; four moderate advisories remain.

Validation: `pnpm verify` passed (54 API unit/HTTP, 59 database integration,
7 web unit tests and builds). All 12 controlled browser tests and both real API
flows passed. Final UI follow-ups passed web typecheck/lint, formatting and the
focused desktop/mobile layout check. Screenshots were inspected against the demo.

## UI reference and push checkpoint — October 24, 2026

User reiterated that the original demo presentation must remain the visual reference.
Integrate API data into its existing components; do not simplify or redesign screens
as a side effect of wiring endpoints. The original complete demo is preserved at
commit `1964b86`. Current `/demo/projects` and `/demo/reviews` retain sample pages,
but share the modified live shell and are not the full original workspace.

Pre-push `pnpm audit --audit-level=high` reported two high advisories: Zod
GHSA-mrhx-c7xc-m3w5 (patched >=4.6.6) and body-parser GHSA-27r3-jxmh-p828
(patched >=2.4.0), plus four moderate advisories. Dependency fixes and revalidation
remain outstanding; the CI audit gate may fail for this checkpoint.

## Live review queue — October 24, 2026

`/reviews` now consolidates real proposal reviews, milestone submissions and unresolved
milestone feedback. The sidebar attention count and overview review/feedback cards use
the same queue. Authors see revision/response work; Main Reviewers see pending decisions
and addressed threads. Existing layout and labelled unfinished demos are preserved;
the original sample review page is available at `/demo/reviews`.

Validation: `pnpm verify` passed (54 API unit/HTTP, 58 database integration and
7 web unit tests, plus builds). All 11 controlled browser tests and both real API
browser flows passed; desktop/mobile queue screenshots were inspected. Final web
typecheck/lint and repository formatting checks passed after the UI follow-ups.

See [reviews.md](./reviews.md) for role rules, result limits and refresh behaviour.
No migration is required. The queue is current work, not a read/unread notification
inbox. App-wide notifications (#4) are the next increment; invitation emails (#3)
and automatic email-worker operation (#1) remain separate follow-ups.

## Editable starting structure and feedback clarity — October 23, 2026

Project creation accepts optional milestone/deliverable overrides on existing presets,
or `templateKey: custom` with both collections required. The frontend supports
editing/reordering required or optional rows before creation; the draft editor now
sends explicit IDs and preserves flags. This customises one project's starting plan,
not the shared preset or a reusable template library. Existing API defaults remain
compatible, source provenance is retained, and no migration is required.

Top-nav Author/Reviewer dropdown is replaced by a fixed label. Proposal feedback,
milestone feedback threads and milestone decision explanations are named explicitly.
Blocking feedback still does not gate milestone approval; final-approval eligibility
remains future work. See projects.md and milestones.md for workflow boundaries.

`pnpm verify` passed: 54 API unit/HTTP, 54 database integration and 7 web tests;
ten controlled browser checks passed. Live-browser verification includes custom
creation, ordering and optional flags alongside the proposal/milestone review flow.

## Connected workspace — October 23, 2026

On branch `test`, the former sample sidebar/card layout is connected to real APIs.
`/overview`, `/projects`, creation/details, `/reviews` and milestone pages require
sign-in. Existing `/workspace` links redirect to the corresponding routes. The
existing live project/milestone components are reused inside the styled shell;
project permissions and all backend contracts remain unchanged. No migration.

UI constraint: preserve the original demo layout and retain unfinished features as
labelled, usable demos. The original sidebar, four-card overview, illustration,
activity/upcoming panels and portfolio preview are restored. DemoProvider remains
mounted for isolated `/demo/projects/...` workflows, portfolio/activity/settings and
sample feedback. Never use sample records as live API records.

Reviewer-only accounts default to a distinct review desk. The top bar now displays
a fixed Author/Reviewer label; mixed-role accounts reach reviews via the sidebar,
and project routes derive presentation from actual membership. Project tabs are restored, with evidence/feedback
linking to their live milestone workflows. Live counts cover at most 100 projects;
remaining sample overview numbers and due dates are labelled Demo preview.

Verification passed: seven web unit tests, ten controlled browser tests and both
real API browser flows, including the restored project tabs. Web lint/typecheck/build
and final formatting checks also passed after UI follow-ups. Changes are local and
uncommitted on `test`.

Follow-ups: invitation emails and status feedback (#3), app-wide notifications/toasts
(#4), evidence coverage/mappings and final deliverable approval. File/image uploads
remain deferred in #2. Automatic email worker operation remains #1.

## Milestone evidence checkpoint — October 22, 2026

Text/link evidence is connected to the live workspace. Open an active project,
then its milestone: authors can save shared drafts, the lead submits an immutable
version, and the active Reviewer approves or requests revision. Feedback belongs
to a submitted version and supports replies, author addressing, Reviewer resolution
and reopening. Project notifications are scoped to their recipient.

The module follows tests/types/schema/repository/service/controller/routes.
Services enforce roles and workflow; repositories persist data. Project locks and
optimistic versions protect competing writes, and snapshots, events and notifications
commit together. Existing session, CSRF and origin protections remain in use.
See [milestones.md](./milestones.md) for endpoints, limits and concurrency semantics.

Migration `1792700000000_milestone-submissions` is applied locally to both development
and isolated test databases. Verification: `pnpm verify` passed with 54 API unit/HTTP,
7 web unit and 51 PostgreSQL integration tests. The live browser flow covers group
creation through milestone revision, feedback resolution and approval, including
immutable history and mobile layout. Pre-push verification passed again;
dependency audit has no high/critical findings (four moderate findings remain).

File/image uploads are deferred to [issue #2](https://github.com/Bash-Abdul/Trace/issues/2)
(storage provider and file policy still to choose). Evidence mappings/coverage and
final deliverable approval remain backend work. Text/link evidence
was the agreed first increment; the whole milestone/product phase is not complete.
The designed overview/projects pages still need live-data integration before
retiring the workspace routes.

The existing project, membership, proposal and milestone APIs are ready to connect
to the designed sample workspace now. Start with projects/details and milestones,
then derive the overview from real data; do not present unsupported sample metrics
as real activity. Reviewer invitation URLs are still shared manually. For local
verification email delivery, use a sender on the verified Resend domain rather
than `onboarding@resend.dev`, and run the email worker after requesting verification.

## Projects SQL review — October 22, 2026

Uncommitted follow-up to `017ee32`: readability cleanup plus fixes for legacy
item identity and decisions on historical pending proposals. The service now
matches unchanged legacy titles before using positional rename compatibility,
rejects ambiguous structural edits without IDs, and checks that a decision targets
the latest pending proposal under the project lock. See [projects.md](./projects.md)
for the remaining limitations of payloads without IDs.

Retained the bulk SQL after verifying deferred position constraints, committed
reordering, deletion, insertion and empty collections. Retained the single-statement
detail query for snapshot consistency. No new migration is needed. API tests:
54 passed; database integration: 44 passed, including six new regression cases.
Next product work: milestone evidence submissions, Reviewer feedback and revisions.

## Backend refactor checkpoint — October 22, 2026

The working tree refactors Projects and its session boundary while preserving the
frontend routes and API response fields. Project controllers return typed HTTP
results; reusable auth middleware owns session validation and mutation commit.
Project reads no longer hold account/project locks or request-long transactions.
Resource permissions stay in services; SQL stays in repositories. Draft writes
preserve IDs and use set-based updates; read details use a single statement.

Migration `1792600000001_preserve-project-structure` adds deferred ordering
constraints, a history index, and provenance/proposal immutability constraints.
See [projects.md](./projects.md) for read/revocation semantics and the compatible
optional item-ID extension. The existing local edit in `revokeSession` was retained.
No new dependency, framework or ORM was introduced.

Verification: 54 API unit/HTTP tests, 38 PostgreSQL integration tests and both
live browser tests passed. The browser tests exercise the full auth lifecycle
and the three-account group invitation, revision and approval flow. API lint,
typecheck, API/web builds and `git diff --check` passed. The migration is applied
to both the isolated test database and local development database.

This checkpoint includes the backend refactor and dependency fixes below. The
preceding frontend integration and project workflow were committed as `359adcd`.

CI audit follow-up: updated proxy-addr, brace-expansion, source-map-js and Vite
within their existing dependency ranges. `pnpm audit --audit-level=high` now
passes with four moderate findings remaining. `pnpm verify` passes, including
seven web unit tests. Rate-limit email extraction now uses a dedicated Zod
schema before route validation, preserving throttling for malformed requests.
The README documents the separate verification and audit commands to run before
pushing.

Next: improve SQL/function readability, then milestone evidence submissions,
Reviewer feedback and revisions. Connect the designed `/overview`, `/projects`
and remaining app pages to real data as their backend features become available;
retire the separate `/workspace` flow once those pages cover the live workflows.

## Current implementation — October 21, 2026

The project workflow is now implemented locally through proposal activation. See
[projects.md](./projects.md) for endpoints, roles and limitations. This update
supersedes the historical checkpoint sections below; these changes were committed
and pushed as `359adcd` before the refactor above.

- Real signed-in workspace: `/workspace`; browser-only samples remain separate.
- Individual/group creation, template copies, memberships, draft editing,
  invitation links, acceptance/cancellation/reissue, proposal revisions and decisions.
- Existing session, CSRF and origin protections apply to all project operations.
- Follow the requested module structure: tests, types, schema, repository, service,
  controller, routes; use the existing `validate()` middleware.
- Invitations are manually shared links for now; email is not sent for them.
- Auth operational follow-up: https://github.com/Bash-Abdul/Trace/issues/1.
- Next: milestone evidence and submission/review workflows, followed by final
  approval and portfolios. Membership removal/lead transfer and Reviewer
  succession remain future work.

### Verification for this update

- API unit/HTTP: 43 passed; web unit: 7 passed.
- PostgreSQL integration: 32 passed, including 8 project workflow tests.
- Browser regression: 8 passed; isolated live API/browser: 2 passed, including
  a three-account group creation, shared draft, revision and approval workflow.
- Build, API/web lint, typecheck and changed-source formatting checks passed.
- Desktop/mobile real-project screenshots inspected; mobile overflow check passed.
- Additive project migration applied to local development and isolated test databases.
- Committed and pushed as `359adcd`.

## Historical checkpoint

## Current position

- Phase 0: complete
- Phase 1: in progress
- Auth API implementation: present through account-wide session revocation
- Auth sign-off: pending a successful run of the final PostgreSQL integration suite
- Next product milestone: projects, memberships, invitations, and project-scoped authorization
- Current checkpoint: October 8, 2026
- Auth implementation commit: `35b0644` (working tree was clean at this review)

## Completed

- pnpm workspace and `apps/api` scaffold
- TypeScript, Express, ESLint, Prettier, Vitest, and Supertest
- environment validation
- structured logging, request IDs, and JSON error handling
- `/health` and `/ready` endpoints
- graceful HTTP and database shutdown
- PostgreSQL 17 local Docker service
- shared `pg` pool and transaction helper
- three-table authentication schema and version-controlled migration
- migration apply, rollback, reapply, and clean CI migration checks
- isolated PostgreSQL integration database and transaction tests
- GitHub Actions quality, database, dependency, and secret checks
- Argon2id password hashing and opaque-token crypto helpers
- reusable Zod validation middleware for bodies, parameters, and query strings
- registration schema, repository, transactional service, controller, and route
- registration endpoint mounted at `POST /api/v1/auth/register`
- registration integration coverage for validation, normalisation, protected persistence, and duplicates
- `outbox_jobs` migration with idempotency, processing-state, retry, and worker-lease foundations
- AES-256-GCM protection for secret verification-email payloads
- registration transaction atomically creates the user, token hash, and encrypted outbox job
- environment and CI validation for the outbox encryption key
- unit and integration coverage for encryption and registration outbox creation
- root `pnpm verify` command
- worker-facing outbox operations with lease recovery, bounded retries, and attempt fencing
- bounded email runner and replaceable Resend adapter
- worker concurrency/retry tests and provider transport tests
- email verification and resend with single-use tokens, expiry, invalidation, and cooldown
- verified-account login, HTTP-only cookie sessions, idle/absolute expiry, and logout
- current-session retrieval, owned-session listing, individual revocation, and revoke-all
- password reset with atomic password replacement, token consumption, and session revocation
- session-bound CSRF checks, origin controls, persistent rate limits, and security audit events
- account locking and credential rechecks for concurrent reset/login requests
- encrypted password-reset emails and suppression of obsolete outbox tokens
- authentication API guide and OpenAPI contract

## Next in Phase 1

1. Start the existing local PostgreSQL service and run the final test suite against
   the guarded `_test` database. Apply any pending test migrations first. This is
   the remaining auth verification gate, not evidence of a known failing auth flow.
2. Build project and membership migrations, project creation/list/detail routes,
   and permissions using the existing authenticated-session transaction boundary.
   Support Individual / Group selection at creation, permanent individual authorship,
   group author memberships with one lead, attributed contributions, exactly one active main Reviewer when assigned,
   and read-only dormant Reviewer rules from the engineering plan.
3. Add email-bound invitations: issuance, expiry, cancellation, and atomic acceptance
   by the verified invited account. Test replay, email mismatch, role uniqueness,
   and concurrency.
4. Verify cross-project isolation and role-specific access; project roles must never
   become global account roles. Keep project activation/proposal behavior in Phase 2.
5. Define the storage interface/configuration boundary only; uploads remain Phase 3.

Frontend auth screens and live email delivery are separate outstanding integration
work. Configure a verified sender and the verification/reset page URLs, then test
the real email-to-browser flow. Provision the bounded worker's schedule at deployment.
No browser or mobile app is present in this checkout. Track mobile reconstruction
in [mobile-recovery.md](./mobile-recovery.md); the previous client architecture
and screens are unknown and must not be invented as historical decisions.

After Phase 1, proceed to templates, proposals, and project activation (Phase 2).

## Latest verification results (October 3; not rerun October 8)

- October 3: all 34 unit/HTTP tests passed; TypeScript, ESLint, and formatting passed.
- The final PostgreSQL suite has 24 tests. Its October 3 run could not exercise the
  workflows because PostgreSQL refused connections at `127.0.0.1:5432`.
- An earlier version passed 20 integration tests. Four subsequently added tests
  and final refinements still need database verification; do not report all 24 as passed.
- October 3: the production build also passed for the final checkpoint.
- The new migration was previously applied only to the test database. Development
  migration state has not been verified.
- No live email was sent. No deployment or remote CI result has been verified.

See [authentication.md](./authentication.md) for configuration, security decisions,
known operational limits, and endpoint behavior, and [auth.openapi.json](./auth.openapi.json)
for the API contract.

## Resume on another PC

1. Pull the latest branch.
2. Install Node.js 24, pnpm 11, and Docker Desktop.
3. Run `pnpm install`.
4. Create `apps/api/.env` from `.env.example`.
5. For a fresh local database, generate `OUTBOX_ENCRYPTION_KEY` as documented in `.env.example`. When restoring existing data, restore the original key; replacing it breaks pending encrypted emails and existing CSRF tokens.
6. Run `docker compose up -d postgres`.
7. Create the local `trace_test` database if it does not already exist.
8. Run `pnpm db:migrate`.
9. Run `pnpm verify`.

## Working agreement

- The user has authorized direct implementation by the assistant (September 18, 2026).
- Preserve existing work; ask before deleting user files, discarding changes, or resetting Git.
- Generated code should include brief comments for important behavior.
- Explain new tools and design choices before introducing them.
- Implement a coherent feature first, then add the smallest risk-based test set before calling it complete.
- Do not create tests for trivial implementation details or library behavior.
- Do not introduce later-phase infrastructure early.
- Use PostgreSQL as the MVP durable job queue; add no external queue without a measured trigger.

## Recovery context

The September 3 Git baseline contained registration and encrypted email enqueueing,
but not the later auth flow or mobile app remembered by the user. This checkpoint
rebuilds the backend auth flow. The earlier mobile implementation and its later
design decisions have not been recovered. Do not treat the baseline plan's native
mobile exclusion as a new user requirement.

Preserve the existing application-owned auth design: Argon2id, opaque database
sessions, and a PostgreSQL outbox. The current schema keeps credentials and primary
email verification on `users`; the engineering plan's separate credential and
verified-email tables describe a target structure that is not implemented here.

A local commit preserves this checkpoint in this clone. Remote backup still requires
an explicit push; do not describe a local commit as remotely backed up.

## October 8 handoff update

The auth implementation was already committed in `35b0644`; no additional
application changes were found. This update records the missing mobile work and
the next milestones. It does not change the auth verification status above.

Immediate next step: finish the PostgreSQL auth checks. Next implementation:
project creation and membership permissions, followed by invitations and access
isolation tests. For mobile, first establish a new, reviewable screen/interaction
baseline and decide the client type before changing the browser-cookie auth
contract. The original client stack is not recoverable from the checked local
history for `apps/mobile` or `apps/web`.


## Web auth integration — October 21, 2026

`apps/web` now provides registration, verification/resend, login, password reset, and protected `/account` session management against the existing cookie-session API. Public sample project routes remain explicitly separate from real account data. Run the API with `APP_ORIGIN=http://127.0.0.1:5173` and the web with `pnpm dev:web`; Vite proxies `/api` to port 3001. No local secrets or email delivery settings were changed.

The auth module owns its typed API boundary and in-memory session state. Action tokens are removed from the URL and consumed only on confirmation; protected mutations carry session CSRF tokens. See `apps/web/README.md` for deployment, email-link configuration, and isolated live browser-test instructions.

Next implementation milestone: real project creation, invitation acceptance, and proposal activation. Do not treat the browser demo project state or persona selector as real authorization or persisted project data.

## Group projects decision — 2026-10-21

Creation offers Individual or Group independently of template and approval route.
Group authors share drafts and evidence; one lead manages author invitations and
submits shared work. Preserve actor attribution and historical contributions when
membership changes. See the engineering plan for permissions and invariants.
The web demo saves this choice and shows the lead role; real invitations, shared
editing, and backend permissions remain to be implemented. Existing demo records
default to Individual without resetting browser storage.
