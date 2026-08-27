# Trace Backend Development Handoff

The [backend engineering plan](./backend-engineering-plan.md) is the authoritative source for product and architecture decisions.

## Current position

- Phase 0: complete
- Phase 1: in progress
- Current task: authentication database schema

## Completed

- pnpm workspace and `apps/api` scaffold
- TypeScript, Express, ESLint, Prettier, Vitest, and Supertest
- environment validation
- structured logging, request IDs, and JSON error handling
- `/health` and `/ready` endpoints
- graceful HTTP and database shutdown
- PostgreSQL 17 local Docker service
- shared `pg` pool and transaction helper
- `node-pg-migrate` commands and TypeScript migration checks
- first authentication migration generated
- root `pnpm verify` command passing

## Next in Phase 1

1. Define the authentication tables in the first migration.
2. Apply and roll back the migration locally.
3. Add PostgreSQL migration and transaction integration tests.
4. Add CI checks.
5. Implement registration and email verification.
6. Implement login, opaque sessions, and logout.
7. Implement password reset and session revocation.
8. Add CSRF protection, authentication rate limiting, and security audit events.
9. Implement projects, memberships, invitations, and project-scoped authorization.
10. Define the storage interface only; do not implement uploads yet.

## Resume on another PC

1. Pull the latest branch.
2. Install Node.js 24, pnpm 11, and Docker Desktop.
3. Run `pnpm install`.
4. Create `apps/api/.env` from `.env.example`.
5. Run `docker compose up -d postgres`.
6. Run `pnpm db:migrate` after migrations have been approved.
7. Run `pnpm verify`.

## Working agreement

- The user writes application code unless file edits are explicitly requested.
- Generated code should include brief comments for important behavior.
- Explain new tools and design choices before introducing them.
- Do not introduce later-phase infrastructure early.
