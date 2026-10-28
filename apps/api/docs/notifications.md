# Notification inbox

The existing bell opens an inbox using the workspace's modal and colour styles.
This is persistent event history; Review & feedback remains the current-work queue.

## Events and recipients

- Proposal submission → Main Reviewer.
- Proposal decision → lead Author and Authors.
- Milestone submission → Main Reviewer.
- Milestone decision or new feedback → lead Author and Authors.
- Author feedback response/addressing → Main Reviewer.
- Reviewer response/resolution/reopening → lead Author and Authors.

The actor is excluded. Services choose recipients by role; repository inserts share
the domain mutation transaction, so a rollback produces no notification. Retries
rejected by the existing version/status checks do not produce duplicates. No emails
or browser push notifications are sent by this module.

## API

All routes use the existing session, browser, origin, rate-limit and CSRF protections
under `/api/v1/projects/notifications`:

- `GET /` → `{ items, unread_count, next_cursor }`.
- `GET /?before=<notification UUID>` → next older page.
- `PATCH /:notificationId` with `{ read: true | false }` → 204.
- `POST /read-all` with `{}` → 204.

Pages contain at most 50 items ordered by creation time and UUID descending. The
cursor lookup is recipient/membership scoped. Counts cover all accessible unread
items, not just the current page; reads share a repeatable-read snapshot. Mark-all
updates accessible unread records visible to its statement; later events remain
unread. Repeating a mark operation is safe.

Only the recipient with a current lead Author, Author or Main Reviewer membership
can list or update a notification. Removed members and dormant Reviewers see none.
An inaccessible notification ID returns 404. Project deletion cascades to its history.

## Migration and compatibility

Run `pnpm db:migrate`. Migration `1792800000000_notification-inbox` adds `read_at`
and event `details`, and allows a null milestone for proposal events. Existing
milestone notifications are preserved and initially unread. Old events have generic
labels where decision details were not recorded. No proposal history is backfilled.
The older project-scoped notification endpoint retains its milestone-only contract.
Rolling this migration down removes proposal notifications because the old schema
requires every notification to reference a milestone.

## Web behaviour

The bell shows the unread count (99+ visually above 99). Opening it refreshes the
newest page. The inbox also refreshes on navigation, window focus, successful workspace
mutations and every 30 seconds while the document is visible. Older/newest controls
navigate pages. Opening an unread item marks it read before navigating; a failed
update keeps the inbox open with retryable feedback. Mark-read/unread and mark-all
are available explicitly. The bell remains available on mobile.

Project, invitation-link, proposal, evidence and feedback mutations now emit action
toasts after a successful API response, or a failure toast alongside the existing
inline error. These messages confirm saved actions, never email delivery. Existing
demo toast styling is reused. Email invitation delivery/status remains a separate
follow-up (#3), and broader notification preferences/channels remain future work.
