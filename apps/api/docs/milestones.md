# Milestone submissions: text and links

The live project page links to `/workspace/projects/:projectId/milestones/:milestoneId`.
Authors contribute text and HTTP(S) links; file uploads are the next increment.
Evidence belongs to exactly one milestone. There is no independent evidence approval.

## Workflow and roles

`NOT_STARTED → DRAFT → AWAITING_REVIEW → APPROVED`

A reviewer can instead request revision: `AWAITING_REVIEW → REVISION_REQUESTED → DRAFT`.
Saving a revision retains the prior submitted versions. Each submission contains an
immutable, bounded JSON snapshot of relational draft evidence and contributor IDs.

- Only active projects accept mutations.
- Lead and additional Authors can edit drafts; only the lead submits.
- Only the current main Reviewer decides a pending version or creates feedback.
- Feedback targets a submitted version. Authors can respond or mark open feedback
  addressed. Only the main Reviewer can resolve or reopen it.
- Blocking feedback is independent of milestone approval. It remains recorded for
  the later final-approval eligibility checks; marking it addressed does not resolve it.
- Dormant Reviewers can read but cannot mutate or receive ordinary workflow notifications.
- A missing project membership or cross-project milestone returns 404.

## API

All routes inherit the existing session, origin, CSRF and rate-limit controls.
The base below is `/api/v1/projects/:projectId/milestones/:milestoneId`.

| Method | Suffix | Request |
| --- | --- | --- |
| GET | `/` | Full milestone state, draft, versions, feedback and messages |
| PATCH | `/draft` | `{ version, evidence: [{ id?, title, kind, content }] }` |
| POST | `/submissions` | `{ version }` |
| POST | `/submissions/:submissionId/decision` | `{ version, decision, feedback }` |
| POST | `/submissions/:submissionId/feedback` | `{ body, blocking }` |
| PATCH | `/feedback/:feedbackId` | `{ version, action, body }` |

Evidence kinds: `TEXT`, `LINK`. Decisions: `APPROVE`, `REQUEST_REVISION`.
Feedback actions: `RESPOND`, `ADDRESS`, `RESOLVE`, `REOPEN`.
Feedback actions use the feedback thread's version; draft/submission/review actions
use the milestone version. Stale or conflicting mutations return 409. Workflow
ineligibility (inactive project, missing reviewer, empty submission) returns 422.

Draft evidence is limited to 30 items with titles up to 120 characters and content
up to 10,000 characters each, also subject to the API's overall JSON request limit.
Empty drafts are valid; empty submitted versions are not. Existing IDs must belong
to this draft and cannot be duplicated. New items omit IDs. Reordering retains IDs
and deferred position uniqueness is checked at transaction commit.

## Transactions and persistence

The module follows schema/types/repository/service/controller/routes/test layering.
Services own permissions and workflow transitions; repositories own persistence.
Authenticated mutations lock the account/session and project before checking state.
The project lock serializes shared drafts, review and feedback transitions. Conditional
updates also check the expected version or pending decision and report affected rows.
HTTP success is sent only after the transaction commits.

Reads use a short read-only repeatable-read transaction so the simple repository
queries share one snapshot without project/account locks. New writes produce a
project event without evidence text and recipient notifications in the same transaction.
`GET /api/v1/projects/:projectId/notifications` returns the caller's latest 100
notifications, shown on the live project page. It is not an email delivery mechanism.

## Remaining work

This is the text/link workflow increment, not completion of the entire evidence phase.
Private uploads and authorised downloads, objective/expected-evidence mappings,
coverage projections, paginated version/feedback history, notification read state,
and explicit idempotency keys remain. Current duplicate submissions/reviews are
prevented by state/version checks and constraints and return conflicts on retry.
Final deliverables, final-approval checks and portfolios follow separately.
