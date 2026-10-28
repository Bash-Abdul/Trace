# Final deliverables

Open a live project, then use **Final deliverables → Open deliverable** in its original Overview panel.
This increment implements text/link drafts and versioned submissions (#11). Uploads remain #2;
final project approval and completion are implemented by [final approval (#12)](./final-approval.md).

## Flow and roles

- An active project's individual Author or group Authors can prepare a shared text/link draft.
- Save edits before submitting. Only the lead Author (also the individual project's Author) can
  submit; the main Reviewer must have joined.
- Submission saves an immutable version, including the requirement title, required flag,
  content, note, contributor, last editor and submitting Author.
- Reviewers can read outputs and history. Submission is not a separate deliverable approval
  and does not complete the project.
- **Start a revision** explicitly returns the output to draft. Earlier submissions remain
  readable, but the output no longer counts as currently submitted until resubmitted.
- Approved changes to a deliverable's requirements or project scope require resubmission.
  Reordering and date-only changes preserve submissions. Removed requirements retain history.

## API

All routes are under `/api/v1/projects/:projectId/deliverables/:deliverableId`:

| Method | Path | Body |
| --- | --- | --- |
| GET | `/` | Current draft, state, version, immutable submissions and current submission ID |
| PATCH | `/draft` | `{ version, kind: "TEXT" \| "LINK", content, note }` |
| POST | `/submissions` | `{ version }` |
| POST | `/revision` | `{ version }` |

Links must use HTTP(S). Mutations use existing session, origin and CSRF protections. Current
membership, role, active status and optimistic version checks run within the authenticated
transaction. The project row serializes mutations with membership and project-plan changes.
Stale mutations fail without losing stored work. Failed saves retain typed browser input.

Draft saves create audit events. Submission and revision also create in-app notifications for
current Authors and the main Reviewer, excluding the actor. Global notifications open the output.
The existing polling model remains unchanged; email notification delivery is separate work.

Project progress exposes each active deliverable's required flag, state and exact current
submission ID. This feeds the required-deliverables checklist. Final requests bind to these IDs;
changes to deliverables invalidate pending final requests in the same transaction.
History pagination remains #15.

## Verification

Database regression coverage includes shared drafts, role and project isolation, removed members,
safe URL validation, session/origin/CSRF enforcement, immutable versions, concurrent edits and
submissions, atomic rollback, requirement changes, reorder preservation and archived history.
The live browser flow covers contributor draft → lead submission → Reviewer read → revision →
resubmission, retained history and mobile layout.
