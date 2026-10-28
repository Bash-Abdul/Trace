# Changes to active projects

The live project **Changes** tab supports declared minor edits and a separate major-change workflow. Existing demo styling, navigation and proposal/milestone contracts remain intact.

## Minor edits

Authors may correct wording in active projects with a reason and an explicit `meaningUnchanged: true` declaration. The server rejects item insertion/removal/reordering, requiredness changes and objective-count changes; semantic meaning remains the author's declaration, visible to the reviewer. Objectives currently have positional string identities, so semantic replacement cannot be automatically distinguished from rewording. These are not a bypass for major changes.

Minor edits record before/after snapshots, actor, reason and timestamp in project events and notify the main reviewer. They preserve approvals. Minor edits are held while a major change is open, avoiding a proposal silently overwriting corrections.

## Major changes

`DRAFT → PROPOSED → APPROVED_AND_APPLIED | REJECTED`

The lead can withdraw a draft or proposed change. Authors can collaborate on a draft; only the lead submits/withdraws, and only the current main reviewer decides. There is one open draft/proposal per project. Rejected/withdrawn changes remain in history; a new draft can then be created from the current plan.

The draft contains a reason and full before/after structure. Existing IDs must be sent explicitly; omitted IDs mean new records. Unlike legacy pre-activation clients, active changes never infer identity from position or title. Draft edits have their own version and reject stale requests. Submission freezes content at the database layer. Approval compares the current plan to the proposal's base, applies once atomically and records audit/notifications. State changes lock the same project row used by milestone mutations.

Removed milestones/deliverables are archived with null positions rather than deleted. Current structure/progress excludes them. Removed milestone submissions and feedback remain accessible through **Milestones → Removed milestones · preserved history**. New evidence/submissions/decisions are blocked on archived milestones; existing feedback may still be addressed/resolved. Unresolved blocking discussions remain counted; archiving is not a way to erase them.

Changing a retained milestone's title or requiredness requires fresh milestone approval. Changes to project title, description or objectives conservatively affect all retained milestones because precise objective/evidence mappings are not implemented yet. Pure reordering/addition does not invalidate unrelated approvals. Previous submission decisions remain immutable; current approved state becomes revision requested. Versions of affected drafts also increment so stale editors cannot submit against changed expectations. If an affected milestone is awaiting review, decide that pending submission before applying the project change.

Final requests, deadlines and expected-evidence mappings are not yet implemented. Their future modules must extend change classification/invalidation; this increment does not claim to cancel nonexistent final requests. Reviewer handover remains deferred until last.

## Routes

Base: `/api/v1/projects/:projectId/changes`. All routes inherit session authentication, origin/CSRF protection, validation and transaction-before-response handling.

| Method | Path | Input / result |
| --- | --- | --- |
| GET | `/` | Member-visible change history |
| POST | `/minor` | Current project `version`, full structure, `reason`, `meaningUnchanged: true`; 204 |
| POST | `/` | Current project `version`, full proposed structure, `reason`; 201 draft |
| PATCH | `/:changeId` | Change `version`, full proposed structure, `reason`; 204 |
| POST | `/:changeId/submit` | Change `version`; 204 |
| POST | `/:changeId/withdraw` | Change `version`; 204 |
| POST | `/:changeId/decision` | Change `version`, `decision: APPROVE | REJECT`, `feedback` (required for rejection); 204 |

Schema limits match existing project structure limits. The review queue adds `PROJECT_CHANGE`; proposal-change notifications link to the Changes tab. Minor history displays the existing most-recent 100 project events. Full change/thread/history pagination remains tracked in #15.

Migration `1792890000000_project-changes` adds archive metadata and proposal records/immutability checks without removing data. It is deliberately forward-only: roll back application changes with a compatible schema or write a forward corrective migration rather than deleting history.

Regression coverage includes permissions, stale/concurrent decisions, submitted immutability, rejection/withdrawal, structural edits rejected as minor, identity-preserving reorder/removal, archived evidence/feedback, and approval invalidation. The live browser suite exercises minor edit → major draft → lead submission → reviewer approval → updated milestone plan.
