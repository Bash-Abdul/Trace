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
- `*.controller.ts`: typed input/context, service calls, and explicit HTTP results.
- `*.routes.ts`: route registration, shared `validate()` and other middleware.
- `*.test.ts` / `*.integration.test.ts`: meaningful behavior and isolation tests.

Project requests reuse the existing opaque session, origin and CSRF protections.
Reusable authentication route middleware supplies typed user/session context.
Read requests validate and slide the session in one statement, without a request-long
transaction or account lock; an already-authenticated in-flight read may complete
if its session is revoked afterwards. Detail data and membership are read in one
SQL statement so the response uses one committed snapshot.

Mutations validate the session, check CSRF, and run the controller/service inside
the account-locked transaction. Controllers return an HTTP result; middleware sends
it only after COMMIT succeeds. Do not replace this with authentication followed
by a separate mutation transaction: that would reopen the revocation/reset race.
Project mutations lock the project before checking roles and state. Editing and
proposal decisions also require the latest project `version`; stale requests fail
with HTTP 409. Project access without membership returns 404.

## Roles and creation

Creation selects `INDIVIDUAL` or `GROUP` independently of approval route and
starting template. Both choices are fixed after creation. Four versioned template
presets copy milestone names into project-owned records; they use the existing
web prototype's starting structures. Templates never change an existing project.

Creation optionally accepts `milestones` (1–30) and `deliverables` (1–20), each
with `title` and `required`. These override the preset for this project only.
`templateKey: "custom"` requires both collections. Older preset-only requests
retain the existing defaults. IDs are generated on the server; the source key and
version remain immutable provenance. No database migration is needed. This is not
a reusable user-template library.

The creation form previews and edits the copied structure; the draft editor uses
explicit IDs so renaming/reordering retains identity and optional flags. Authors
can edit the structure in SETUP or PROPOSAL_CHANGES_REQUESTED; it is held while
under proposal review and after activation. A milestone is an ordered stage in
that structure, not a date or an automatically submitted proposal. Each milestone
has its own evidence submissions and review history after project activation.

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

Draft structure updates are set-based and retain milestone/deliverable IDs.
Existing clients may omit item IDs: unchanged unique titles are matched first,
so insertion, deletion and reordering do not shift identities. Same-length edits
with no detected moves retain the legacy positional-rename behaviour. Mixed
renames/structural changes and ambiguous duplicate-title edits require explicit
IDs (`STRUCTURE_IDS_REQUIRED`). A payload without IDs cannot distinguish every
rename from a replacement; clients should send IDs for reliable identity.
Clients sending IDs can reorder existing items and omit IDs for new items. Unknown
or duplicate IDs fail validation at the service boundary. Omitted existing items
are removed only from the editable draft; proposal snapshots remain unchanged.
Deferred position uniqueness supports reordering in the same transaction.
Database triggers also prevent changes to project provenance and submitted
proposal snapshots, including completed decisions.

Draft edits record actor and before/after structure; invitations, submissions,
and decisions also record events. A proposal snapshot cannot be edited via the
API. Only the latest proposal's pending decision may be completed, once. The
service checks this while holding the project lock and the repository checks
that exactly one undecided row was updated.

The bulk persistence queries support empty collections; the public draft schema
continues to require at least one objective, milestone and deliverable. Tests cover
both behaviours, committed swaps, middle deletion, insertion and competing authors.
The single-statement detail query is retained to keep all collections in one
snapshot without introducing a longer read transaction.

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

Text/link milestone evidence, submissions/revisions and feedback are now implemented
in the live workspace; see [milestones.md](./milestones.md). Uploads, evidence
mappings/coverage, final deliverable approval and portfolios remain subsequent work.
Member removal, lead transfer, dormant Reviewer management and
succession have no public endpoints yet. Invitation email dispatch is not part
of this first flow. Preserve historical attribution when adding membership changes.

## Project presentation summaries

List and detail responses include `progress` alongside the existing fields. Its
`milestones` array preserves structure order and contains `id`, `required`, `state`
and `evidence_count` (current draft evidence, without counting immutable versions
again). `unresolved_feedback` and `blocking_feedback` count unresolved threads across
all versions. `members` provides member IDs/emails for avatars. These reads use the
same project membership filter and statement snapshot as the containing response.
They do not grant any new mutation permissions or implement final-project approval.
