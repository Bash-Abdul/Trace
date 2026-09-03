# Trace Backend Development Handoff

The [backend engineering plan](./backend-engineering-plan.md) is the authoritative source for product and architecture decisions.

## Current position

- Phase 0: complete
- Phase 1: in progress
- Current task: process queued verification emails through the PostgreSQL outbox runner

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

## Next in Phase 1

1. Add worker-facing outbox repository operations and focused concurrency tests.
2. Add the scheduled outbox runner and an email-provider interface, then select the provider.
3. Implement email verification and complete registration/verification feature tests.
4. Implement login, opaque sessions, logout, and their feature tests.
5. Implement password reset and session revocation.
6. Add CSRF protection, authentication rate limiting, and security audit events.
7. Implement projects, memberships, invitations, and project-scoped authorization.
8. Define the storage interface only; do not implement uploads yet.

## Resume on another PC

1. Pull the latest branch.
2. Install Node.js 24, pnpm 11, and Docker Desktop.
3. Run `pnpm install`.
4. Create `apps/api/.env` from `.env.example`.
5. Generate and set `OUTBOX_ENCRYPTION_KEY` using the command documented in `.env.example`.
6. Run `docker compose up -d postgres`.
7. Create the local `trace_test` database if it does not already exist.
8. Run `pnpm db:migrate`.
9. Run `pnpm verify`.

## Working agreement

- The user writes application code unless file edits are explicitly requested.
- Generated code should include brief comments for important behavior.
- Explain new tools and design choices before introducing them.
- Implement a coherent feature first, then add the smallest risk-based test set before calling it complete.
- Do not create tests for trivial implementation details or library behavior.
- Do not introduce later-phase infrastructure early.
- Use PostgreSQL as the MVP durable job queue; add no external queue without a measured trigger.
