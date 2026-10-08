# Projects, memberships, and invitations

Implemented October 8, 2026. This is the Phase 1 access boundary. Projects remain
in SETUP for both approval routes. Templates, structure versions, proposals, and
activation transitions are Phase 2; joining both participants does not yet activate
a project. Do not present this checkpoint as the completed project workflow.

## API

All routes are under `/api/v1/projects` and require a valid session. Mutations
require the same matching Origin/Referer and X-CSRF-Token as authenticated auth
mutations. Existing network/account rate limits apply. Responses are no-store.

| Method / path | Purpose |
| --- | --- |
| POST `/` | Create a project and creator membership, optionally issuing the other required role invitation |
| GET `/` | List only assigned projects; `limit` (1–100) and `after` UUID cursor |
| GET `/:projectId` | Project and members; unrelated projects return 404 |
| POST `/:projectId/invitations` | Issue or replace a pending invitation |
| GET `/:projectId/invitations` | Paginated invitation metadata for Author/main Reviewer; no raw tokens or hashes |
| POST `/:projectId/invitations/:invitationId/resend` | Replace a pending invitation with a new token, including after expiry |
| DELETE `/:projectId/invitations/:invitationId` | Cancel a pending invitation, except an unfilled Author slot |
| POST `/invitations/accept` | Accept using `{ token }` and an `Idempotency-Key` header |
| GET `/:projectId/history` | Member-visible audit history in chronological order with UUID cursors |

Creation body:

```json
{
  "title": "Research project",
  "approvalRoute": "IN_PLATFORM_PROPOSAL",
  "creatorRole": "AUTHOR",
  "inviteEmail": "reviewer@example.com"
}
```

`approvalRoute` also accepts `EXTERNALLY_APPROVED`. `creatorRole` also accepts
`MAIN_REVIEWER`, in which case `inviteEmail` is required for the Author. A creator
cannot invite their own email. Response: 201 `{ project, invitation }`; invitation
is null when an Author creates without inviting a Reviewer yet.

Invitation body: `{ email, role }`, with role AUTHOR, MAIN_REVIEWER, or
DORMANT_REVIEWER. The issuance/resend response includes metadata and a raw `token`
exactly once. This implements the plan's copy-link option; the frontend can place
the token in an invitation page URL fragment and POST it after sign-in. There is
no invitation email job or invitation page yet. Never log or persist raw tokens.
A lost token requires reissue; listing never reveals it.

Acceptance requires a verified account with exactly the normalized invited email.
`Idempotency-Key` accepts 1–128 letters, digits, underscores, or hyphens. Retrying
with the same key/account/token returns the original `{ projectId }`. Reusing the
key for a different token returns 409; replaying with a new key returns 404.
Expired, cancelled, unknown, and wrong-account invitations all return the same
404 without revealing project data. Role conflicts return 409.

Lists return `{ projects|invitations|events: [...], nextCursor }`. Project and
invitation lists use UUID ordering; history uses `(created_at, id)` ordering.
Pass nextCursor as `after` for the next page. The default limit is 20.

The contract is in [auth.openapi.json](./auth.openapi.json), which retains its
original filename but now includes project endpoints too.

## Permissions and invariants

- Creator provenance and approval route are immutable.
- An Author creating a project is immediately its permanent Author. A Reviewer
  creating one establishes a pending Author invitation in the same transaction.
- Accepted authorship cannot be replaced or removed. Database constraints enforce
  one accepted Author or one outstanding Author invitation, including expired
  invitations awaiting replacement. Pending Author invitations must be replaced,
  not simply cancelled, so the role slot remains represented.
- At most one main Reviewer can be assigned. An Author can invite the initial main
  Reviewer only while the role is vacant. This grants no succession authority.
- Only the main Reviewer can invite a missing Author or dormant Reviewers.
- Dormant Reviewers can read project detail/history but cannot manage invitations,
  promote themselves, or receive ordinary workflow notifications.
- Roles are project-specific. No account-level Reviewer permission exists.
- Acceptance locks the project, consumes the invitation, inserts membership,
  assigns authorship where appropriate, records the idempotent response, and writes
  audit/notification records in one transaction. Failures roll everything back.
- Project operations re-read roles after obtaining the project lock. Account locks
  use FOR NO KEY UPDATE to retain auth serialization while allowing foreign-key
  references from concurrent members' audit/notification writes.

New invitations expire after 7 days by default, configurable with
INVITATION_TTL_SECONDS. Reissuing a singleton role supersedes any pending invitation
for that role, even when changing recipient. For dormant roles, replacement is
limited to the same email. Cross-role pending invitations to one email are rejected.

Notifications are durable rows for the Author/main Reviewer other than the actor,
created with each audit event; this checkpoint does not add a notification inbox
or read-state API. Project deletion, membership removal, role transfers, and
project metadata/structure editing are not exposed in this phase.

## Validation and operational state

Integration tests cover both creation roles, cross-project denials, verified-email
acceptance, token protection, expiry/replacement/cancellation, concurrent and
idempotent acceptance, permanent authorship, role uniqueness, dormant permissions,
notification suppression, CSRF/origin checks, pagination, transaction rollback,
and two-member concurrency without notification foreign-key deadlocks.

Apply the new migration with `pnpm db:migrate` when preparing development runtime.
Implementation verification uses an isolated test database; development migrations
and environment credentials are not changed by that verification.

The storage module defines only interfaces. No bucket, upload route, storage adapter,
or file policy has been introduced. Those remain Phase 3.
