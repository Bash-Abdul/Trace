# Group member removal and lead transfer

Group leads can manage accepted Authors from the existing project **Team** tab. Each action opens a confirmation dialog describing its effects and requires a reason. Individual-project authorship and Reviewer roles cannot be changed here. Reviewer handover remains deferred until last.

## Access and attribution

Removal records the current membership's user ID, role, joined timestamp, removal time, actor and reason in `project_membership_removals`, then removes only the current access grant. User records, evidence, immutable submissions, feedback messages, original project creator and project events remain intact. Current members can see former Authors in the Team panel and resolve their names in milestone contribution/thread history.

All project, milestone, review-queue and notification reads/mutations continue to require current membership. Removed users lose future access and ordinary notifications. An already authenticated read in flight may finish under the existing read semantics; removal does not destroy the user's account or sessions for other projects.

A removed Author can be invited again as an Author through the normal verified-email acceptance flow. Rejoining does not erase prior removal records. Both invitation issuance and acceptance reject assigning a former Author as main Reviewer of their own work.

## Lead transfer

Only the current group lead can transfer to an accepted `AUTHOR`. The current lead cannot be removed directly. The transfer demotes the outgoing lead to `AUTHOR` and promotes the target to `LEAD_AUTHOR` in one transaction, using the same project row lock as invitations, changes and milestone work. Demotion happens first to respect the immediate unique-lead index; other transactions only see committed states. Both role updates check affected rows, and a failure rolls back both.

The outgoing lead retains normal Author access and attribution, but loses team management and lead-only submission authority immediately. Pending responsibilities use the current role; historical submissions still name the person who actually submitted them. Project creator provenance does not change.

Pending invitations issued by a removed member or outgoing lead are cancelled in the same transaction. This prevents obsolete authority from granting access or reserving a role indefinitely. The new lead may issue fresh links; cancellation IDs and the reason are included in audit events.

## API and notifications

Base: `/api/v1/projects/:projectId/members/:userId`.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| POST | `/remove` | `{ version, reason }` | 204 |
| POST | `/transfer-lead` | `{ version, reason }` | 204 |

`version` is the current project version, captured when the confirmation opens. Reasons are non-empty and limited to 2,000 characters. Requests inherit session authentication, origin/CSRF checks, validation and account-locked transactions. Only a group lead may act; rejected projects cannot change membership. Targets must be accepted group Authors, not pending invitees, the current lead or Reviewers. Stale project versions fail rather than applying an outdated confirmation.

Audit, project version, membership changes and in-app notifications commit together. Notifications go to current Authors/lead and the main Reviewer, excluding the actor and removed member. They link to Team. No email delivery is implemented by these endpoints.

## Concurrency fix

A reproduced race between member removal and that member saving evidence exposed an account/project lock cycle: a foreign-key check on the removed user's ID could wait for their account's `FOR UPDATE` lock while their write waited for the project lock. The session-account guard now uses `FOR NO KEY UPDATE`: it still serializes account mutations and conflicts with password-reset/revocation locks, while permitting foreign-key key-share reads. The locking order and authentication checks remain unchanged.

That regression also exposed a stale membership JOIN after a project-lock wait. `findMemberProjectForUpdate` now acquires the project lock first, then rereads membership and project state in a fresh statement snapshot. All membership writes hold that same project lock, so authority remains stable through the operation. The extra read is necessary for permission correctness, not stylistic consistency. The two-connection test reproduces the original deadlock and verifies that a waiting evidence save fails with lost membership after removal commits.

Migration `1792891000000_membership-history` is additive and forward-only to preserve attribution. It has been applied to the isolated test and local development databases. Tests cover HTTP protections, roles, history/access loss, transfer, invitation cancellation, re-invitation, former-author review exclusion, competing actions, rollback and the account/project race. Browser checks exercise confirmation, stale-request input retention, mobile layout, removal, re-invitation and transfer.
