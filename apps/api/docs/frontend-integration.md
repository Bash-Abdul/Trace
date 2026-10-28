# Frontend integration checkpoint — 28 October 2026

The live workspace retains the original demo layouts. `/overview`, `/projects`, project tabs,
milestones, deliverables, reviews, notifications and portfolios use authenticated APIs.

The overview's approved milestone count now comes from project progress. Its activity panel and
`/activity` use the existing project-detail history endpoint. A labelled project selector loads
one project's records at a time, avoiding requests for every project. Switching projects clears
the previous display; failures offer retry. The global activity page explicitly labels the
100-event API window when reached. Earlier records remain in the portfolio; history pagination
is still tracked in #15. Project list pagination beyond the existing 100-project limit also
remains a backend limitation, not an all-project history promise.

`/settings` uses the signed-in identity and links to existing account/session controls. It does
not invent profile, email preference or workspace settings APIs. Fictional reset controls are
only under `/demo/settings`; sample activity remains at `/demo/activity`. All `/demo` routes
retain explicit sample labels and use browser-only data.

Portfolio navigation and the overview teaser belong to the author workspace. `/portfolio` lists
only authored projects. Reviewers retain read-only portfolio access from an assigned project;
server membership checks remain authoritative. The local portfolio presentation correction keeps
current evidence concise and exposes historical records in expandable sections; browser printing
expands them temporarily and restores their previous state afterwards.

Legacy `/workspace` routes redirect to the corresponding live routes. Sample projects remain
available for design comparison. Uploads, invitation email, email notification preferences,
history pagination and reviewer handover remain their respective backend/product issues.

After this integration pass, the owner will list desired changes for the MVP review. Preserve
original typography, cards, spacing and navigation while addressing that list.

Verification: web formatting, lint, type checking, 8 unit tests and the production build passed.
All 18 controlled browser tests and all 3 live API/browser journeys passed, covering activity
switching/retry, mobile overflow, settings/sample separation, reviewer navigation, auth, group
review/revision, final completion and portfolio printing. The existing bundle-size warning remains.
This checkpoint is prepared for the `test` branch; production deployment remains separate.
