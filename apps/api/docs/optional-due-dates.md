# Optional project and milestone due dates

The owner confirmed these rules on October 26, 2026. Dates are optional; existing projects and milestones receive no invented dates or timezone.

## Behaviour

- Project and milestone dates are calendar dates (`YYYY-MM-DD`), stored as PostgreSQL `date`, not timestamps. Clearing a date removes its deadline.
- All dates within a project use its named timezone. New web projects suggest the creator's browser timezone, which can be edited. Older projects without a timezone must select one before adding dates. The API does not guess a timezone.
- A date remains **Due today** through the end of that local day. It is **Overdue** once the next local calendar day starts. **Due soon** means 1–7 calendar days away; dates further ahead are **Scheduled**.
- Calendar-day comparisons use the project timezone and handle daylight-saving transitions. A date's displayed day never changes with the viewer's timezone.
- Overdue is informational. Authors can save and submit late evidence; Reviewers can review it. Dates never change a decision automatically.
- Approved milestones show **Approved** with their date and are excluded from the dashboard's upcoming/overdue list. Rejected projects are inactive and excluded. Project completion does not yet exist; project deadlines continue to describe the overall project until that later workflow is implemented.
- The dashboard shows the earliest three dated projects/milestones available in the current author/reviewer view, including overdue work. Undated work is omitted. Existing project-list limits still apply.
- There is no new background job or email dependency. Status is calculated on API reads; reload/refresh the view to obtain the current status after a day boundary. Email reminders remain future work under #6.

## Editing and history

Dates can be entered at creation and edited in a draft brief. On an active project, adding, changing or clearing dates, or changing timezone, uses **Changes → Propose a project change**. The lead submits it and the main Reviewer approves; the current schedule remains unchanged until approval. Minor wording edits cannot alter dates/timezone.

Date-only changes preserve existing milestone approvals. They do not change the evidence/expectations a Reviewer approved. Changes that also alter work requirements retain the existing approval-invalidation rules.

Creation events record the original schedule using stable milestone IDs. Draft events, immutable proposal snapshots, before/after change snapshots and submission coverage snapshots preserve dates/timezone at those points. Historical records from before date support remain untouched. Old saved changes without date fields remain usable when the original plan still matches.

## API and implementation

Project create/draft/change payloads accept optional `dueDate: string | null` and `timezone: string | null`. Milestone structure entries accept optional `dueDate: string | null`. Omitting fields on older clients preserves current values during edits; explicit `null` clears a value. A timezone is required if any project/milestone date exists. Dates and IANA timezone names are validated at the existing route boundary; project-lock, role, CSRF and optimistic-version protections are retained.

Read projections add `deadline: { state, daysRemaining }` on projects, progress milestones and milestone detail. API services derive these projections without writing status back to the database. Repositories store/read date text and timezone; business rules remain in services. Date-only changes do not introduce an independent approval endpoint.

Migration `1792971000000_optional-due-dates` adds nullable fields and a project deadline/timezone check. It is forward-only. No date relationship such as “milestone must be before project date” is imposed: authors/reviewers decide the schedule, including historical/past dates.

Tests cover absent dates, invalid/leap dates and timezone names, London daylight-saving boundaries, viewer/project timezone differences, due-soon boundaries, approved work, stale updates, optional-date clearing, old-client omission, immutable history, date-only reviewed changes and late submissions. Browser tests cover date creation, displayed calendar dates, live dashboard routing and mobile layout.
