# Trace Backend Development Handoff

Updated October 8, 2026. Read this checkpoint before repeating earlier work.
The [backend engineering plan](./backend-engineering-plan.md) contains the product
rules and overall roadmap; the implementation guides describe the current APIs.

## Current position

- Phase 0: complete.
- Phase 1 backend access implementation: complete at this checkpoint.
- Auth API: implemented through account-wide session revocation; final database
  verification is now complete. Do not restart the auth implementation.
- Projects, memberships, and copy-link invitations: implemented and tested.
- Next implementation: Phase 2 templates, structure versions, proposals, and activation.
- Projects currently remain in SETUP for both routes, even after both participants
  join. Activation is explicitly deferred until Phase 2 establishes structure versions.
- Browser/mobile screens, live email verification, and deployment remain outstanding.

## Implemented

- TypeScript/Express workspace; validation, logging, errors, health/readiness,
  PostgreSQL pool/transactions, migrations, tests, build, and CI configuration.
- Registration, email verification/resend, verified-account login, opaque cookie
  sessions, idle/absolute expiry, logout, session listing and revocation.
- Password reset with atomic token consumption, password replacement, and
  account-wide session revocation; CSRF/origin checks, rate limiting, security audits.
- PostgreSQL outbox runner with purpose-bound encryption, leases, bounded retries,
  attempt fencing, obsolete-token suppression, and a replaceable Resend adapter.
- Project creation by Author or main Reviewer, member-only listing/detail/history,
  permanent authorship, immutable creator/approval route, and unique role assignments.
- Email-bound invitations with configurable expiry, replacement/resend, cancellation,
  verified-email acceptance, atomic membership updates, and idempotent acceptance.
- Dormant Reviewer read-only permissions; cross-project denials; transactional
  project audit events and ordinary notification rows excluding dormant Reviewers.
- Private storage interface/configuration types only. No adapter, uploads, bucket,
  or file policy has been introduced.
- One API contract in [auth.openapi.json](./auth.openapi.json), retaining its original
  filename while now covering project access as well as authentication.

## Verification

- October 8: `pnpm verify` passes: formatting, lint, TypeScript, 34 unit/HTTP tests,
  34 PostgreSQL integration tests, and production build.
- All migrations applied successfully to a fresh disposable database. The 24
  auth/outbox/database tests that were previously blocked now pass, alongside
  10 project integration tests.
- Local verification used PostgreSQL 18.6 server binaries extracted under `/tmp`,
  loopback port 55432, and a new `trace_backend_test` database because Docker's WSL
  integration was unavailable. No system server package/service was installed.
- CI remains configured for PostgreSQL 17; no remote CI run is claimed here.
- Development database and `.env` were not changed. Run `pnpm db:migrate` against
  development when preparing the runtime; its migration state is not verified here.
- No real email was sent and no deployment was performed.

## Next: Phase 2

1. Define and seed the four versioned templates from the engineering plan. Copy
   structure into each project so later template edits cannot change existing work.
2. Implement project-owned objectives, ordered milestones, expected evidence,
   deliverables, and immutable structure/proposal versions.
3. Add Author proposal submission and current-main-Reviewer decisions against the
   exact submitted version; reject stale decisions and unauthorized role actions.
4. Implement both activation routes with participant checks and recorded structure
   provenance. External approval activates only once the required participants and
   valid structure exist; in-platform activation additionally requires approval.
5. Add transactional timeline/notification updates and focused concurrency/access
   tests for those transitions. Preserve the existing project membership boundary.

Uploads remain Phase 3. Succession/automatic transfers remain Phase 4. Avoid adding
those systems while implementing Phase 2.

## Integration work still outstanding

- Auth frontend pages and real email-to-browser verification/reset flow.
- Invitation frontend page using copy links. Invitation email delivery is not
  implemented; the plan explicitly permits the copy-link option.
- Notification inbox/read-state API; this checkpoint persists notification rows.
- An external schedule for `pnpm worker:email`, live sender configuration, and
  deployment-specific proxy/cookie configuration and Argon2 parameter review.
- Mobile reconstruction, tracked separately in [mobile-recovery.md](./mobile-recovery.md).

See [authentication.md](./authentication.md) and [projects.md](./projects.md) for
configuration, endpoint behavior, security decisions, and implementation limits.

## Decisions worth preserving

- Keep application-owned Argon2id and opaque database sessions; no JWT migration
  is underway. JWTs would not remove verification/reset/access-control workflows.
- Account operations use FOR NO KEY UPDATE: password-reset/login/session operations
  still serialize, while foreign-key references from another member's notification
  writes do not deadlock. Project roles are re-read after obtaining the project lock.
- Pending Author invitations cannot simply be cancelled, because every project
  must retain an Author slot; reissue to the correct recipient instead.
- Invitation tokens are returned only at issuance/reissue and stored only as hashes.
  Acceptance retries require the same account, token, and Idempotency-Key.
- The current auth schema keeps credentials/primary-email verification on users;
  separate credential/verified-email tables in the original plan remain a target
  structure, not implemented functionality.

## Working agreement and recovery

- Direct implementation by the assistant is authorized. Preserve existing work;
  ask before deleting user files, discarding changes, or resetting Git.
- Explain material design choices, test coherent features, and record checkpoints.
- Use PostgreSQL as the durable queue. Add no external queue without a measured need.
- Do not regenerate OUTBOX_ENCRYPTION_KEY when restoring existing data. Preserve
  the original key for pending encrypted email payloads and existing CSRF tokens.
- The earlier mobile app and its decisions have not been recovered. Do not treat
  the baseline plan's native-mobile exclusion as a new user instruction.
- Local commits preserve local history. Remote backup requires an explicit push;
  do not claim a commit is remotely backed up without confirming the push.
