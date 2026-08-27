# Trace Backend Development Handoff

The [backend engineering plan](./backend-engineering-plan.md) is the authoritative source for product and architecture decisions.

## Current position

- Phase 0: complete
- Phase 1: in progress
- Current task: authentication security primitives, followed by registration

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
- Argon2 dependency and authentication crypto module started
- root `pnpm verify` command passing

## Next in Phase 1

1. Finish and verify the authentication crypto primitives.
2. Implement registration as one complete feature slice.
3. Add proportionate registration tests after the feature works.
4. Implement email verification and its feature tests.
5. Implement login, opaque sessions, logout, and their feature tests.
6. Implement password reset and session revocation.
7. Add CSRF protection, authentication rate limiting, and security audit events.
8. Implement projects, memberships, invitations, and project-scoped authorization.
9. Define the storage interface only; do not implement uploads yet.

## Resume on another PC

1. Pull the latest branch.
2. Install Node.js 24, pnpm 11, and Docker Desktop.
3. Run `pnpm install`.
4. Create `apps/api/.env` from `.env.example`.
5. Run `docker compose up -d postgres`.
6. Create the local `trace_test` database if it does not already exist.
7. Run `pnpm db:migrate`.
8. Run `pnpm verify`.

## Working agreement

- The user writes application code unless file edits are explicitly requested.
- Generated code should include brief comments for important behavior.
- Explain new tools and design choices before introducing them.
- Implement a coherent feature first, then add the smallest risk-based test set before calling it complete.
- Do not create tests for trivial implementation details or library behavior.
- Do not introduce later-phase infrastructure early.
