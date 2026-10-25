# Review queue

`GET /api/v1/projects/reviews` returns `{ items, truncated }` for the signed-in
user. Existing session, browser and rate protections apply. No migration is needed.

The queue combines current proposal reviews, current milestone submission reviews,
and unresolved milestone feedback, including threads on older submission versions.
Each item includes its project, optional milestone, version number, state, excerpt,
role, perspective, action label and `needs_attention` flag.

| Work | Author attention | Main Reviewer attention |
| --- | --- | --- |
| Proposal | Changes requested | Pending proposal |
| Milestone submission | Revision requested, including a saved revised draft | Awaiting review |
| Milestone feedback | Open or reopened thread | Addressed by Author |

Approved/rejected proposals, approved milestone submissions and resolved feedback
leave their respective queue categories. Unresolved feedback remains even after
milestone approval. Only current lead Authors, Authors and Main Reviewers receive
items; dormant Reviewers, removed members and outsiders receive none for that project.
The destination screens retain their existing action authorisation rules.

Repositories execute three parameterised reads in one read-only repeatable-read
transaction. Services choose eligible roles and calculate attention/action labels.
Each category returns at most 200 recent items; `truncated` reports additional work.
Within that bounded result, actionable items appear first, then most recently updated.
This is not an exhaustive count when truncated; older work remains inside projects.

The web Review & feedback page filters by attention, type and involvement. The sidebar
badge and relevant overview cards share this data. Refresh occurs on navigation,
window focus, manual refresh and every 30 seconds while the app is visible. Failed
refreshes retain previous data with an error message. Links open the relevant project
proposal overview or milestone, where submission history and feedback are available.

This is a current-work queue, not a notification history or read/unread inbox.
The persistent bell inbox and workspace action toasts are implemented separately;
see [notifications.md](./notifications.md). Email delivery status remains a follow-up. Invitation
email delivery remains #3; file/image uploads remain #2.

Regression tests cover membership isolation, latest proposals, submission revisions
and resubmission, feedback addressing/resolution/reopening, older-version feedback,
removed memberships and bounded results. Browser tests cover filters and refresh;
the live flow checks the submission appears for its Reviewer and leaves after approval.
