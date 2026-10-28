# Objectives, expected evidence and coverage

Issue #9 adds factual requirement coverage using the existing brief, change-review and milestone flows. It does not introduce an overall score or independently approve evidence items.

## Using the flow

1. Create a project as before. In **Edit brief**, each objective has its own row and stable identity. Renaming or moving a row keeps its links. A new objective gets its ID when the brief or change draft is saved; save and reopen before linking a newly added objective.
2. Expand **Objectives and expected evidence** within a milestone. Select the objectives it supports and add required or optional evidence expectations. Existing projects start with no inferred mappings or expectations.
3. Once active, use **Changes → Propose a project change** to change these requirements. The lead submits and the main Reviewer approves. Minor wording edits cannot change requirements or mappings. A changed requirement invalidates that milestone's current approval; brief/objective changes retain conservative invalidation across retained milestones. Pending affected submissions must be decided first.
4. In a milestone's evidence draft, select the objectives and expected evidence each text/link item addresses. Save, then submit through the normal milestone review flow.
5. **Evidence coverage** appears within the project overview and milestone view. Submission history also shows the expectations and evidence links captured for each submitted version.

## Meaning of the states

| State | Meaning |
| --- | --- |
| Missing | No current evidence item is linked to the expectation or objective contribution. |
| Draft | Linked evidence is in the current editable draft. |
| Submitted | The linked milestone submission is awaiting review. |
| Revision requested | The milestone requires revision, including an approval invalidated by an approved project change. |
| Accepted with milestone | Linked evidence belongs to the currently approved milestone submission. |

Coverage is derived from explicit links plus milestone state. There is no independent approval or quality score for an evidence item. An objective with multiple linked milestones reports the least complete contribution: missing, revision requested, draft, submitted, then accepted. An unlinked objective is missing. Optional milestones and optional evidence remain visible and labelled.

Missing mappings do not independently block milestone submission or approval. An approved milestone can still have a missing expectation. `requiredOmissions` lists missing required expectations on required milestones for the later final-eligibility flow (#12); final approval is not implemented by this increment.

## Contracts and persistence

- Existing `objectives: string[]` contracts remain. `objectiveIds` is the parallel ID array; mutation inputs use `null` for a new objective. Explicit IDs are validated against the current/draft plan. Legacy text-only edits cannot rename mapped objectives by position.
- Milestone structure entries add `objectiveIds` and `expectedEvidence: [{ id, title, required }]`. Omit an expected-evidence ID only when creating a requirement. Omitting these fields on an older client preserves existing settings; explicit empty arrays remove them through the permitted edit/change flow.
- Evidence draft entries add `objectiveIds` and `expectationIds`. Omitted mapping fields retain existing mappings for that evidence item; empty arrays clear them.
- `GET /api/v1/projects/:projectId/coverage` returns milestone/objective states and required omissions. It checks current membership and reads under one repeatable-read snapshot.
- Relational composite foreign keys enforce project ownership of objective/milestone links and milestone ownership of draft evidence mappings. Position uniqueness is deferred so reordering does not change identity.
- Submitted evidence snapshots keep mapping IDs and labels. `milestone_submission_coverage` additionally stores the complete requirement list at submission time, including missing expectations. Its update trigger prevents mutation. Historical versions created before this feature have no invented coverage snapshot.
- Removal deletes current links/requirements only; immutable proposals, submitted evidence and coverage snapshots retain their original meaning. Archived milestone history remains available.
- Mutations reuse the existing session/CSRF guards, project row lock and optimistic versions. Requirement changes increment affected milestone versions, so an evidence save waiting behind a plan change cannot silently use a stale draft.
- Pre-migration saved project changes can still be applied when their original plan matches and no new coverage settings have intervened; their saved snapshots remain untouched.

Migrations `1792970000000_evidence-coverage` and `1792970000001_submission-coverage-snapshots` are forward-only. They assign IDs to existing objectives, create relational mappings and preserve existing content.
