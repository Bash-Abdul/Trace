# Projects, invitations and proposal activation

The signed-in web workspace is `/workspace`. Public `/overview` and `/projects`
remain the browser-only sample workspace. Real project data lives in PostgreSQL;
the sample persona selector never grants permissions.

## Module structure

Use this structure for backend modules, as requested by the project owner:

- `*.types.ts`: shared domain, persistence and request types.
- `*.schema.ts`: Zod request validation.
- `*.repository.ts`: parameterised SQL using the supplied transaction client.
- `*.service.ts`: permissions, workflow rules and orchestration.
- `*.controller.ts`: typed HTTP handling and the authenticated transaction boundary.
- `*.routes.ts`: route registration, shared `validate()` and other middleware.
- `*.test.ts` / `*.integration.test.ts`: meaningful behavior and isolation tests.

Project requests reuse the existing opaque session, origin and CSRF protections.
Project mutations lock the project before checking roles and state. Editing and
proposal decisions also require the latest project `version`; stale requests fail
with HTTP 409. Project access without membership returns 404.

## Roles and creation

Creation selects `INDIVIDUAL` or `GROUP` independently of approval route and
starting template. Both choices are fixed after creation. Four versioned template
presets copy milestone names into project-owned records; they use the existing
web prototype's starting structures. Templates never change an existing project.

An Author creator receives `LEAD_AUTHOR` (displayed as Author on individual
projects). A Reviewer creator receives `MAIN_REVIEWER` and can invite the initial
Author/lead while the project is in setup. One account cannot hold two roles on
the same project.

| Actor | Allowed invitations | Draft editing | Submit proposal |
| --- | --- | --- | --- |
| Individual Author | Main Reviewer | Yes | Yes |
| Group lead | Authors, Main Reviewer | Yes | Yes |
| Group Author | None | Yes | No |
| Main Reviewer | Initial Author/lead during setup | No | No |
| Dormant Reviewer | None | No | No |

There is at most one lead and one main Reviewer. Individual projects cannot have
additional Author memberships. All members can read project history; only the
lead/main Reviewer can see invitation records. Review decisions belong only to
the main Reviewer.

## Invitations

Invitations currently use manually shared links, not email dispatch. Issuance
returns a link once; raw tokens are never stored or logged. Links expire in seven
days, require a signed-in verified account matching the normalized invited email,
and are consumed atomically. Reissuing for the same email invalidates the previous
link. A reserved lead/Reviewer invitation must be cancelled before inviting a
different person into that slot. Expired reservations are released on issuance.

The browser removes the token fragment and accepts only on an explicit click.
If the recipient needs to sign in or register, they should do so and reopen the
original link. Refreshing the acceptance page also requires reopening the link.

## Routes

All paths below are relative to `/api/v1/projects`. Mutations require a matching
Origin/Referer and `X-CSRF-Token`, in addition to a valid session cookie.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/templates` | Versioned creation presets |
| GET | `/` | Up to 100 most recently updated joined projects |
| POST | `/` | Create project and creator membership |
| GET | `/:id` | Brief, membership, proposals and recent history |
| PATCH | `/:id` | Replace draft structure with optimistic version check |
| POST | `/:id/invitations` | Issue/reissue an email-bound invitation link |
| DELETE | `/:id/invitations/:invitationId` | Cancel a pending invitation |
| POST | `/invitations/accept` | Accept using `{ token }` |
| POST | `/:id/proposals` | Submit immutable snapshot using `{ version }` |
| POST | `/:id/proposals/:proposalId/decision` | `{ version, decision, feedback }` |

Decisions are `APPROVE`, `REQUEST_CHANGES`, or `REJECT`. Changes/rejection require
feedback. Approval activates the project. Requested changes allow editing and
resubmission while retaining old snapshots. Rejection is terminal. External
approval activates automatically when the initial Author/lead and main Reviewer
have joined; extra group invitations do not block activation.

Draft edits record actor and before/after structure; invitations, submissions,
and decisions also record events. A proposal snapshot cannot be edited via the
API. Only its pending decision may be completed, once.

## Running and verification

Apply the additive migration with `pnpm db:migrate`, start the existing API/web
commands, sign in, and choose **Open my projects**. Keep APP_ORIGIN aligned with
the browser origin because invitation links derive from it.

`pnpm --filter @trace/api test:integration` applies migrations to the configured
isolated `_test` database and covers project isolation, individual/group roles,
CSRF/origin, invitation expiry/reissue/cancellation/replay, concurrent acceptance,
unique Reviewer slots, shared drafts, stale decisions, proposal revisions and
both activation routes. The live browser suite adds a three-account group flow
and verifies the individual invitation selector. See the web README for its
isolated API/database setup.

## Subsequent work

Milestone evidence, submissions/revisions, feedback and portfolios remain the next
product phase. Member removal, lead transfer, dormant Reviewer management and
succession have no public endpoints yet. Invitation email dispatch is not part
of this first flow. Preserve historical attribution when adding membership changes.
