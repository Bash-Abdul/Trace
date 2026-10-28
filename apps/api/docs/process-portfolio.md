# Process portfolio

Open **Process portfolios** in the workspace navigation, or **Process portfolio** on a project.
The original demo cover cards, four document sections, typography and print layout are retained.
Sample portfolios remain available under `/demo/projects/:projectId/portfolio`.

`GET /api/v1/projects/:projectId/portfolio` requires a current authenticated project membership.
It reads in a repeatable-read transaction. Previous participation in a saved team does not grant
access after membership removal. There is no public share link or unauthenticated export endpoint.

## Live preview

Before completion, the document is labelled **Live preview · work in progress**. It includes
project metadata/activation, current/former team attribution, proposal snapshots, milestone
submission versions and their evidence/coverage, clearly labelled unsubmitted milestone drafts,
feedback threads/replies, plan changes, deliverable versions, the current readiness checklist,
and the complete ordered activity timeline. Existing project detail views limit their activity
list; the portfolio captures the full timeline separately rather than silently using that limit.

Only metadata supported by Trace is shown; no institution details or participant display names
are invented. Safe HTTP(S) links are clickable and text is rendered as text, never injected HTML.
Private files/images remain deferred to #2. Current deliverable draft content is edited on the
output page; the portfolio shows submitted output history and whether it is currently submitted.

## Final record

Completion creates a version-2 manifest in the same transaction as the final decision, status,
audit and notifications. It retains the project/plan/team snapshot, checklist, exact version IDs,
full submission/feedback/change records and complete timeline. Record data is frozen so later
metadata changes cannot rewrite the approved document. No file bytes are copied. Unsubmitted
milestone drafts are excluded from the final record.

Original version-1 manifests remain readable using their saved metadata and allowlisted history
IDs; they retain the original saved activity window. No new records are added to those histories.
A completed project without a saved manifest reports an error rather than pretending current
mutable data is its final record.

## Printing and verification

**Print / save as PDF** invokes browser printing. All submitted versions and thread replies are
rendered in the document, so printing does not omit collapsed history. Print CSS removes navigation,
toasts and controls, uses A4 margins and retains readable links. Browser-generated PDF is supported;
server-generated archives, workers and public distribution are not introduced.

Regression coverage checks current membership, cross-project isolation, contributor attribution,
full timelines, stable legacy references, live drafts, snapshot stability and atomic rollback.
The connected browser journey checks live/final labels, output versions, mobile overflow, portfolio
index navigation and print media, and produces a test PDF. Longer-history pagination is tracked in
#15; private attachment integration stays in #2.
