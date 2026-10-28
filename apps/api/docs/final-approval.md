# Final approval and completion

Use the existing **Project → Overview → Ready for the finish line?** panel.
The checklist is calculated by the API; client-side button states are not authorization.

## Flow

1. Required milestones must be approved, required deliverables currently submitted, required
   evidence omissions cleared, blocking feedback resolved, and proposed major changes decided
   or withdrawn. The main Reviewer must have joined. Current templates define no extra declarations.
2. The individual Author or group lead requests final approval. Other group Authors cannot request it.
3. The main Reviewer opens the request from Overview, the review queue or an in-app notification.
   They approve completion or request revision with an explanation.
4. Revision returns the project to Active. The Author can revise work and request approval again.
5. Approval atomically closes the request, marks the project Completed, records the audit event,
   creates in-app notifications and stores an immutable portfolio manifest.

Due dates are optional and informational. Neither missing dates nor overdue dates block approval.
Optional deliverables and milestones are not completion requirements. The final step does not
introduce individual evidence approval or independent deliverable approval.

## Pending requests and history

Each request stores its exact plan, accepted milestone submission IDs, current deliverable version
IDs, Reviewer identity and machine-evaluated checklist. Submitted snapshots and closed decisions
cannot be edited. The lead can withdraw a pending request.

Authorized changes to milestone work/feedback, deliverables, the project plan or accepted membership
invalidate a pending request in the same transaction. This is conservative: even nonblocking feedback
or a minor plan correction requires the Author to request approval again. Invitations that have not
been accepted do not affect readiness. Invalidated requests remain in history with their checklist.
All relevant mutations serialize on the project row. Decision handling checks current membership and
compares the live eligibility snapshot again; a mismatch persists invalidation and does not complete
anything. Completed projects reject further project, membership, milestone, feedback and deliverable
mutations through these APIs.

## API and retry behavior

Routes are under `/api/v1/projects/:projectId/final-approval`:

| Method | Path | Body |
| --- | --- | --- |
| GET | `/` | Returns current checklist, project version/state and request history |
| POST | `/` | `{ version, key }` where `key` is a UUID retry key |
| POST | `/:requestId/decision` | `{ key, decision: "APPROVE" \| "REQUEST_REVISION", feedback }` |
| POST | `/:requestId/withdraw` | Empty body |

Ineligible requests return 422; stale versions, closed requests and conflicting retry-key reuse
return 409. Cross-project request IDs return 404. Existing session/origin/CSRF protections apply.
A matching request/decision retry returns the current detail without duplicate events, notifications
or completion snapshots. The UI preserves the retry key and typed decision feedback after a failed
request. Withdrawal is also safe to retry.

A decision response can report that the request was invalidated because its inputs changed. Clients
must render the returned state rather than assume every successful HTTP response means approval.

## Portfolio boundary

`final_portfolio_snapshots` stores the approved request, project/structure/team/audit snapshot,
submission and change IDs, feedback state snapshots and message IDs. Historical records remain
available by stable identity; file bytes are not copied. The authenticated printable portfolio
renderer and pre-completion preview are implemented in [process portfolio (#13)](./process-portfolio.md).
History pagination and broader workflow idempotency remain tracked separately (#15).
