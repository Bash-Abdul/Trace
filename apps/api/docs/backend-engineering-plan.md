# Trace Backend Engineering Plan

Status: Approved target plan  
Current phase: Phase 1 in progress; the initial TypeScript/Express API scaffold exists  
Authority: This is the authoritative backend engineering plan for Trace

## How to use this plan

Trace supports two activation routes: an Author proposal approved in Trace, or a project approved elsewhere that activates when its Author and active main Reviewer have joined. Active projects progress through separate milestone submissions, Reviewer feedback and revision, required deliverables, an Author final-approval request, and active-main-Reviewer approval. The final process record is a printable web portfolio.

Build Trace as a TypeScript/Express modular monolith backed by PostgreSQL, with a durable scheduled runner for email and Reviewer succession. This keeps strongly related approvals, history, permissions, and transfers transactional without premature distributed-system complexity.

Authentication is application-owned email/password authentication using Argon2id and opaque, database-backed sessions carried in secure HTTP-only cookies. Trace owns accounts, credentials, sessions, verification, reset, and revocation workflows; it does not use JWTs or an external authentication service/framework.

The authentication method is selected and Phase 1 has started. Decide upload restrictions before Phase 3, and escalation timing and initiation before Phase 4. Timezone rules must precede deadline calculations. Deletion, retention, no-successor recovery, and measurable service targets can wait until before real users.

## 1. Product definition

Trace is a project supervision and evidence platform for long-running assessed projects where the development process matters alongside the final result. It provides explicitly assigned participants with a structured record of approved expectations, milestone submissions and revisions, supporting evidence created elsewhere, Reviewer feedback, material changes, final deliverables, and the development of the final outcome.

Trace does not create project content, grade work, detect plagiarism, or replace tools such as Word, GitHub, Figma, or Jupyter.

### Intended MVP outcome

An Author and active main Reviewer can take a project through one of two approval routes, supervise it through milestone-level review cycles, satisfy final requirements, approve completion, and present the resulting process as a printable web portfolio.

### Product boundaries

Institutions are optional project metadata. They are not tenants, accounts, permission boundaries, identity providers, or workflow owners. All access derives from explicit project membership.

The MVP excludes AI assessment or generation, grading, plagiarism detection, institution accounts, university integrations, GitHub and reference-manager integrations, multiple active Reviewers, real-time chat, native mobile applications, institution-wide workflows, milestone dependency graphs, template administration, and generated PDF or ZIP archives.

## 2. Domain language

- **User:** A person with an application-owned Trace account.
- **Project:** The permission, workflow, and history boundary.
- **Institution metadata:** Descriptive information attached to a project, never an access boundary.
- **Participant:** A user explicitly assigned to a project.
- **Author:** The permanent person responsible for the assessed work. The Author need not create the project record; a Reviewer may create it and invite the Author.
- **Active main Reviewer:** The single Reviewer currently authorised to perform Reviewer workflow actions.
- **Dormant sub-reviewer:** A read-only Reviewer assigned to the project and optionally eligible for succession.
- **Approval route:** `IN_PLATFORM_PROPOSAL` or `EXTERNALLY_APPROVED`.
- **Project proposal:** The project structure submitted by an Author for in-platform approval.
- **Template:** A version-controlled starting structure.
- **Project structure:** The project-owned copy of objectives, ordered milestones, expected evidence, and deliverables.
- **Minor change:** A wording, grammar, or formatting edit that preserves meaning and requirements.
- **Major change:** A controlled change requiring active main Reviewer approval.
- **Milestone Submission:** The reviewable evidence package submitted against exactly one milestone.
- **Submission version:** An immutable version of a Milestone Submission.
- **Evidence item:** Text, explanation, link, or file contained in a submission version.
- **Blocking feedback:** Feedback that must be resolved before final approval can be requested.
- **Final approval request:** The Author's request for the active main Reviewer to approve completion.
- **Process Portfolio:** A printable web representation of the project's recorded process.

## 3. Actors and permissions

| Capability | Author | Active main Reviewer | Dormant sub-reviewer |
| --- | --- | --- | --- |
| View assigned project and complete history | Yes | Yes | Yes |
| Edit pre-activation structure | Yes | Reviews through applicable route | No |
| Submit an in-platform proposal | Yes | No | No |
| Decide an in-platform proposal | No | Yes | No |
| Create and submit milestone work | Yes | No | No |
| Give feedback and decide a milestone submission | No | Yes | No |
| Respond to or mark feedback addressed | Yes | No | No |
| Resolve or reopen Reviewer feedback | No | Yes | No |
| Propose a major project change | Yes | May record a Reviewer-requested change | No |
| Decide a major project change | No | Yes | No |
| Submit final deliverables and request final approval | Yes | No | No |
| Decide final approval | No | Yes | No |
| Manage succession and promote a dormant Reviewer | No | Yes | No |
| Receive ordinary workflow notifications | Yes | Yes | No |

Dormant sub-reviewers receive succession notices only when directly involved in a transfer. This is a narrow exception to their exclusion from ordinary workflow notifications. No role grants access to unrelated projects.

## 4. Membership, authorship, and invitation invariants

- A project has exactly one Author role slot. During setup, that slot may be awaiting acceptance of an email-bound invitation.
- The user who creates the project is recorded separately as `created_by_user_id` and may be the Author or a Reviewer.
- Once the Author accepts the role, their `author_user_id` is immutable.
- If another person must become the Author, a new project must be created. History is not transferred.
- An active project has exactly one active main Reviewer and may have zero or more dormant sub-reviewers.
- A user may hold different roles across any number of concurrent projects.
- Access always requires explicit membership; institution metadata and Reviewer status have no global effect.
- A former main Reviewer cannot reactivate themselves. Only the current main Reviewer can promote or re-add them to succession.
- The Author cannot select a successor or acquire Reviewer authority.

Invitations are bound to a normalised email address and project role. Tokens are cryptographically random, expiring, single-use, and stored only as hashes. Trace may email the link or allow the inviter to copy the same link. Acceptance requires an authenticated account with the invited email verified, and atomically consumes the token and fills the role. Resending invalidates any superseded token. Concurrent acceptance cannot create duplicate role holders.

## 5. Project activation

The approval route is immutable after project creation. An incorrect route requires a new project so approval provenance remains clear.

### `IN_PLATFORM_PROPOSAL`

```text
SETUP
  -> both required participants joined
  -> Author submits immutable proposal version
  -> PROPOSAL_IN_REVIEW
       -> changes requested -> PROPOSAL_CHANGES_REQUESTED -> resubmit
       -> rejected          -> PROPOSAL_REJECTED
       -> approved          -> ACTIVE
```

Approval applies to the exact proposal version. A stale decision fails. Rejection is terminal for the MVP; reopening requires a new project.

### `EXTERNALLY_APPROVED`

```text
SETUP
  -> Author joined and active main Reviewer joined
  -> ACTIVE
```

Activation records the route, triggering acceptance, timestamp, and active structure version. Trace does not verify the external decision.

## 6. Templates and project change control

The four built-in templates are immutable, version-controlled seed data. Creation copies a named template version into project-owned records. Later seed changes never modify existing projects. Milestones use an explicit order with no dependency graph.

Before activation, structure can be edited directly with full history. An in-platform proposal freezes an immutable version for review.

After activation, minor edits are applied immediately but record actor, timestamp, field, before and after values, reason, and minor-change declaration. The backend must always route structural operations such as requiredness changes through the major-change workflow. Semantic text changes cannot be classified reliably by software, so the Author chooses the path and the history remains visible to the Reviewer.

Major changes include adding or removing required milestones or deliverables, changing requiredness, meaningfully changing an objective, changing required evidence, changing a significant deadline, or replacing an approved expectation.

```text
DRAFT -> PROPOSED -> APPROVED_AND_APPLIED
                  -> REJECTED
                  -> WITHDRAWN
```

Approval and application occur in one transaction against the exact proposal version. A change to required evidence invalidates the affected milestone approval. A change affecting final eligibility cancels a pending final-approval request and returns the project to `ACTIVE`.

## 7. Milestone Submissions, evidence, and feedback

Each milestone has at most one logical Milestone Submission, with multiple immutable versions. A submission belongs to exactly one milestone and can contain multiple explanations, text items, links, files, and objective or expected-evidence mappings. Neither a submission nor an evidence item can cover multiple milestones.

```text
NOT_STARTED -> DRAFT -> AWAITING_REVIEW
                           -> APPROVED
                           -> REVISION_REQUESTED
                                -> new DRAFT version -> AWAITING_REVIEW
```

Only the Author edits drafts and submits versions. Only the current active main Reviewer approves or requests revision. A decision identifies the exact version and fails if it is stale or the actor has lost active-main status. Evidence items have no independent approval state; they are included in an approved submission.

Feedback can target a submission version, project-change proposal, final-approval request, or another explicitly supported subject.

```text
OPEN -> ADDRESSED_BY_AUTHOR -> RESOLVED_BY_REVIEWER
  ^              -> reopened by Reviewer --------|
```

Marking feedback addressed notifies the active main Reviewer but does not resolve it. Blocking feedback must be resolved before final approval.

## 8. Coverage and progress

Progress is derived from authoritative records and must not imply grading or quality.

For each milestone, expose requiredness, submission state, missing expected-evidence mappings, blocking feedback, and—after timezone rules are confirmed—deadline state. A required milestone is complete only when its latest applicable submission version is approved.

Expected-evidence coverage states are `MISSING`, `DRAFT`, `SUBMITTED`, `REVISION_REQUIRED`, and `ACCEPTED_WITH_MILESTONE`. Objective coverage is derived from linked milestones and evidence and uses equivalent factual states.

The project summary reports required milestones approved or outstanding, optional milestone states, expected-evidence and objective coverage, required deliverables missing or submitted, unresolved blocking feedback, pending major changes, checklist items, deadline status, and final-approval status. Do not create a combined percentage without a separately approved formula.

## 9. Final approval and completion

```text
ACTIVE
  -> all required milestones approved
  -> all required deliverables submitted
  -> all blocking feedback resolved
  -> generated checklist satisfied
  -> Author requests final approval
  -> FINAL_APPROVAL_PENDING
       -> revision requested -> ACTIVE
       -> active main Reviewer approves -> COMPLETED
```

The checklist is machine-evaluable and includes the conditions above, unresolved required-evidence omissions, pending major changes affecting eligibility, and any template-required declarations. Store the exact checklist as an immutable snapshot.

The final request references current structure, milestone approvals, deliverable versions, and checklist. Any eligibility-affecting change invalidates it. Final approval, project completion, audit creation, notifications, and the final portfolio snapshot commit atomically.

## 10. Reviewer succession and inactivity

Reviewer membership has a status of `ACTIVE_MAIN` or `DORMANT`. Eligible dormant Reviewers have unique project-level succession positions. A demoted main Reviewer is not automatically succession-eligible; the new main Reviewer must explicitly add or promote them, preventing automatic authority loops.

Manual promotion locks the relevant memberships, verifies the actor and target, demotes the current main Reviewer, promotes the target, adjusts succession order, records the reason, creates audit and notifications, and commits once. Pending responsibilities should be authorised dynamically through the active role rather than copied to a named Reviewer.

An inactivity escalation stores its initiating source and reason, a snapshot of its configured schedule, attempts, timestamps, response deadline, designated successor, status, and resolution or transfer reason.

```text
PENDING -> NOTIFYING -> ACKNOWLEDGED_OR_CANCELLED
                    -> TRANSFERRED
                    -> BLOCKED_NO_SUCCESSOR
```

At the threshold, the runner locks the escalation and memberships, revalidates current state, selects the next eligible successor, transfers authority once, records every attempt and reason, and notifies involved participants. If there is no eligible successor, it grants no authority to the Author and enters `BLOCKED_NO_SUCCESSOR` pending an audited recovery process. Automatic transfer must be idempotent across concurrent runner executions.

The initiator, notice schedule, and transfer timing must be decided before Phase 4 implementation. Recovery with no successor remains a before-real-users decision.

## 11. Notifications

The Author receives notifications for proposal decisions, Reviewer feedback, revision requests, milestone approvals, change decisions, final decisions, and main Reviewer transfer. The active main Reviewer receives notifications for proposal submissions, milestone submissions and resubmissions, feedback marked addressed, project-change proposals, and final-approval requests.

Dormant sub-reviewers receive no ordinary workflow notifications. Direct participants in a succession transfer receive transfer-related notices.

Domain state, audit events, and in-app notifications commit together. Email uses a durable outbox so provider failure does not roll back domain work. A unique event-recipient key prevents duplicates. Transfer gives the new main Reviewer a pending-work summary rather than replaying historical notifications. Polling is sufficient for the MVP.

## 12. Process Portfolio

The MVP portfolio is an authenticated, printable web view containing project and institution metadata, activation history, objectives, ordered milestones, submission and revision history, text evidence, safe images, links, file metadata with authorised downloads, decisions, changes, feedback, responses, final deliverables, timeline, checklist, and final decision.

Before completion, participants can view a labelled live preview. Final approval stores an immutable manifest of included record identifiers and versions. The web view renders from that snapshot; it does not duplicate file bytes. Safe allowlisted images may render inline, while other files use authorised, short-lived download links and safe content-disposition headers. PDF, ZIP, archive storage, and portfolio rendering workers are out of scope.

## 13. Target architecture and stack

```text
Browser frontend
      |
    HTTPS
      |
TypeScript / Express modular monolith
  - authentication and sessions
  - projects, memberships, invitations
  - proposals, templates, and structure
  - milestone submissions and feedback
  - changes and Reviewer succession
  - deliverables and final approval
  - progress, audit, notifications, portfolio
      |
PostgreSQL -------- private object storage (from Phase 3)
      |
durable scheduled runner / outbox processor
```

Use a supported Node.js LTS release, TypeScript, Express, PostgreSQL through `pg` and parameterised raw SQL, `node-pg-migrate` for version-controlled migrations, Zod boundary validation, REST JSON under `/api/v1`, OpenAPI as the integration contract, structured JSON logs, private S3-compatible object storage, and a transactional email provider.

Raw SQL is an approved architectural choice. Keep it behind small typed database and repository boundaries, pass one `PoolClient` through each transaction, and make migrations the sole schema authority. This approach must preserve explicit transaction ownership, project scoping, parameterised values, predictable row-to-domain mapping, and integration tests against real PostgreSQL.

A modular monolith keeps approval, version, access, notification, and transfer operations within reliable PostgreSQL transactions. No confirmed scale or ownership boundary justifies microservices. The scheduled runner uses the same release artifact and domain services; PostgreSQL job/outbox records remain its durable source of truth.

Deploy initially as one regional managed API service, one scheduled runner or worker, managed PostgreSQL, and—from Phase 3—private object storage. Use managed TLS and secrets and automated deployment after CI. Provider choice depends on budget, region, data residency, and service targets. Kubernetes and self-managed databases are not justified.

## 14. Application-owned authentication

### Selected method

Use email/password authentication with opaque, database-backed sessions. The browser receives only a high-entropy session token in a secure HTTP-only cookie. PostgreSQL stores a hash of that token and session metadata, never the raw token.

JWTs are not selected. Trace has one backend trust boundary and needs immediate logout, account-wide revocation after password reset, and operator-visible session invalidation. Opaque sessions provide these properties without signing-key rotation, token deny lists, or stale embedded claims.

Trace must not use Clerk, Auth0, Better Auth, Supabase Auth, or another authentication service or framework. It may and must use trusted primitive libraries and Node.js platform cryptography rather than implementing cryptography itself.

### Registration and verification

- Register with a normalised email and password after generic abuse checks.
- Hash passwords with Argon2id using a maintained Argon2 library. Benchmark and document library parameters for the deployment environment against current security guidance before release.
- Store only the encoded Argon2id hash; never encrypt or log passwords.
- Send a verification token generated using Node.js cryptographically secure random functionality.
- Store a SHA-256 hash of the verification token, purpose, user, expiry, creation time, and consumed time. SHA-256 is invoked through Node.js `crypto`, not implemented manually.
- Consume verification tokens once and invalidate older outstanding tokens for the same purpose when appropriate.
- Require a verified invited email before invitation acceptance.

### Login, sessions, and logout

- Verify passwords through the Argon2 library using timing-safe library behavior.
- Return generic authentication errors to reduce account enumeration.
- On successful login, generate a new random session token with sufficient entropy using Node.js `crypto.randomBytes` or equivalent established platform functionality.
- Store only its SHA-256 hash with `user_id`, creation time, last-used time, absolute expiry, idle expiry, revocation time/reason, and limited device metadata where useful.
- Set the raw token in a `__Host-` prefixed cookie with `Secure`, `HttpOnly`, `Path=/`, no `Domain`, and an appropriate `SameSite` policy for the selected same-origin deployment.
- Rotate the session token after login and other privilege-relevant authentication transitions.
- Logout revokes the current database session before clearing the cookie.
- Support listing and revoking other sessions; password reset revokes all existing sessions by default.
- Enforce both idle and absolute expiration. Exact durations are security configuration documented before release rather than hard-coded domain behavior.

### Password reset

- Always return a non-enumerating response to reset requests.
- Generate a secure random, short-lived, single-use reset token and store only its hash.
- After valid token consumption, hash the new password with Argon2id, mark the token consumed, revoke existing sessions, and record an audit event in one transaction.
- Invalidate superseded reset tokens and do not reveal whether an email exists through timing or response content beyond practical mitigations.

### CSRF and browser controls

- Prefer a same-origin frontend and API.
- Protect all state-changing cookie-authenticated requests with a synchronizer CSRF token tied to the server session and supplied in a custom request header.
- Also validate `Origin` and, where appropriate, `Referer`; `SameSite` cookies are defence in depth rather than the sole CSRF control.
- Do not enable permissive credentialed CORS. If a separate frontend origin is later required, explicitly allow only configured trusted origins.
- Apply secure response headers and prevent authentication pages or token-bearing responses from being cached improperly.

### Rate limiting and audit

- Rate-limit registration, verification resend, login, reset request, reset consumption, and invitation acceptance using both network and account/email-oriented keys where safe.
- Use progressive delays or temporary throttles without creating a permanent account-lockout denial-of-service vector.
- Record security-sensitive audit events for registration, email verification, login success, relevant login failure summaries, logout, reset request without token content, password reset, session revocation, verified-email change, and suspicious rate-limit actions.
- Never log passwords, raw session/verification/reset tokens, cookie values, or complete signed links.

Core authentication tables are `users`, `user_credentials`, `user_verified_emails`, `auth_sessions`, and `auth_action_tokens`. Purpose-specific uniqueness and expiry indexes prevent ambiguous active tokens. Authentication transactional email is delivered through the same durable outbox pattern as invitations.

## 15. Application modules

- **Authentication:** registration, verification, login, sessions, logout, reset, CSRF, security audit, and authentication email.
- **Projects and memberships:** project creation, creator provenance, permanent Author assignment, roles, lifecycle, institution metadata, and central authorisation.
- **Invitations:** create, deliver, copy, expire, revoke, and atomically accept email-bound invitations.
- **Proposals and activation:** immutable proposal versions, decisions, and both activation routes.
- **Templates and structure:** seed templates, copy structure, ordered milestones, minor history, and major changes.
- **Milestone submissions:** single-milestone aggregates, immutable versions, evidence items, uploads, and coverage mappings.
- **Review and feedback:** version-specific decisions, messages, blocking state, addressed and resolved transitions.
- **Reviewer succession:** dormant memberships, order, promotions, escalation attempts, transfers, and blocked state.
- **Deliverables and final approval:** immutable submissions, checklist snapshots, final requests, decisions, and completion.
- **Progress:** factual coverage, deadline, feedback, deliverable, and final-state projections.
- **Audit and timeline:** immutable domain and security events without secrets or raw evidence bodies.
- **Notifications and outbox:** transactional in-app notifications and retried email delivery.
- **Portfolio:** live preview, final snapshot, printable view, and authorised file access.

Modules expose application services and own their rules. Controllers do not implement transitions or access another module's tables directly.

## 16. Data model and constraints

Principal tables:

- Authentication: `users`, `user_credentials`, `user_verified_emails`, `auth_sessions`, `auth_action_tokens`.
- Projects: `projects`, `project_memberships`, `project_invitations`.
- Succession: `reviewer_succession_entries`, `reviewer_inactivity_escalations`, `reviewer_escalation_attempts`.
- Templates: versioned template, objective, milestone, expected-evidence, and deliverable tables.
- Structure: project structure versions, objectives, milestones, expected evidence, deliverables, objective-milestone links, change proposals, and change items.
- Proposals: `project_proposals`, `project_proposal_versions`, `project_proposal_decisions`.
- Evidence: `milestone_submissions`, `milestone_submission_versions`, `submission_evidence_items`, `submission_attachments`, objective links, expected-evidence links, and review decisions.
- Feedback: `feedback_threads`, `feedback_messages`, `decision_records`.
- Final workflow: deliverable submissions and versions, final requests, checklist snapshots, final decisions, and portfolio snapshots.
- Cross-cutting: `audit_events`, `notifications`, `outbox_jobs`, `idempotency_records`.

`projects.created_by_user_id` records provenance. `projects.author_user_id` may be null only while the Author role is awaiting invitation acceptance and becomes immutable when filled. A project must always have exactly one Author role slot represented by the accepted Author or its single active invitation.

Database constraints enforce one accepted Author, one active main Reviewer, unique eligible succession positions, one logical submission per milestone, unique version numbers, same-project and same-milestone evidence mappings, one current draft, and exact reviewed versions. Use opaque public identifiers, optimistic `version` columns, server timestamps, and JSON only for bounded snapshots rather than primary relational structure.

Access PostgreSQL through `pg` using parameterised raw SQL. Use `node-pg-migrate` for explicit, version-controlled schema changes, including partial unique indexes and constraints. Application startup must not apply migrations automatically.

## 17. API contract

Use REST JSON under `/api/v1` with Zod validation and one authoritative OpenAPI contract.

Authentication endpoints include registration, email verification, verification resend, login, logout, password-reset request and consumption, current session, session listing, and session revocation. Cookie-authenticated mutation endpoints require CSRF protection.

Project endpoints cover creation, listing, detail, invitations, proposal versions and decisions, minor edits, major-change proposals and decisions, milestone draft/submit/approve/revision operations, feedback, Reviewer succession, deliverable submission, final checklist and approval, progress, timeline, notifications, and portfolio views.

There are no independent evidence-approval endpoints. Milestone routes decide the current immutable submission version. The public initiation endpoint for Reviewer inactivity is not defined until its authorised initiator is decided.

Use cursor pagination for history collections; stable error codes with a correlation ID; `409` for stale versions and conflicting transitions; `422` for workflow ineligibility; and idempotency keys for invitation acceptance, proposal and milestone submission, Reviewer transfer, final requests, and final decisions. Cross-project resource lookups must not disclose resource existence.

## 18. Transactions and concurrency

Transactions cover registration token issuance, verification consumption, password reset and session revocation, project creation and role setup, invitation acceptance, external activation, proposal submission and approval, milestone version submission and review, major-change approval and application, succession order and transfer, final checklist and request, final approval and portfolio snapshot, and every material domain write with its audit and in-app notifications.

Use optimistic versions for drafts and structure; row locks for activation, approval, and transfer; partial unique indexes for active role and token invariants; unique event-recipient notification keys; idempotency records; and `FOR UPDATE SKIP LOCKED` for outbox and escalation jobs. A Reviewer action fails if the actor loses active-main status before commit.

Transaction helpers must acquire one `PoolClient`, issue `BEGIN`, pass that client to every participating repository operation, and reliably `COMMIT`, `ROLLBACK`, and release it. Code inside a transaction must not fall back to pool-level queries.

## 19. Uploads and object storage

Define the storage interface and configuration boundary in Phase 1, but do not provision private object storage or implement uploads until Phase 3, after file policy is decided.

The Phase 3 flow creates a pending attachment and random object key, returns a short-lived direct-upload URL, verifies the stored object's metadata, performs required checks, and makes it available to the draft. File bytes remain in private object storage; PostgreSQL holds metadata and object keys.

Security requires project authorisation for upload and download, no user-controlled object paths, safe content disposition, image allowlisting, no inline active content, short-lived downloads, incomplete-upload cleanup, and no sensitive URLs in logs. Exact file types, sizes, quotas, and malware-scanning behavior are a dependency of Phase 3.

## 20. Security and privacy

Required controls include the application-owned authentication design, project-scoped authorisation on every request, dormant-role immutability, hashed invitation and authentication tokens, private file access, input validation, parameterised database access, secure secrets, TLS, provider encryption at rest, rate limiting, dependency and secret scanning, and comprehensive domain/security audit events.

Threat tests must cover cross-project access, dormant mutation, former-Reviewer self-reactivation, Author manipulation of succession, duplicate automatic transfer, old-Reviewer approval after transfer, invitation replay or email mismatch, stale approval, mutation of submitted evidence, cross-milestone evidence links, structural changes through minor endpoints, incomplete final approval, unsafe inline files, session fixation, CSRF, account enumeration, reset replay, raw-token logging, and session use after revocation.

Deletion and retention remain unresolved and must be decided before real users. Audit history supports accountability but is not described as tamper-proof or compliance-grade.

## 21. Testing strategy

Unit tests cover authentication state and token-purpose rules, project activation, permission matrices, permanent authorship, change routing, Milestone Submission transitions, checklist and coverage calculation, notification recipients, succession selection, and portfolio ordering.

PostgreSQL integration tests cover credential/session persistence, single-use verification and reset tokens, session expiration/revocation, invitation acceptance, active-Reviewer uniqueness under concurrency, external activation, proposal-version decisions, template independence, one submission per milestone, immutable versions, cross-milestone prevention, stale decisions, feedback state, final eligibility, atomic audit/notification creation, manual and automatic transfer, concurrent runners, and blocked escalation.

Contract and security tests cover OpenAPI, CSRF, cookies, generic authentication errors, rate limiting, idempotency, pagination, upload permissions, all role-specific denials, and non-disclosing cross-project responses.

End-to-end tests cover registration through verification, login/logout, password reset and old-session revocation, both project activation routes, separate milestone submissions, revision and approval, blocking feedback, major-change invalidation, every final-approval guard, manual and automatic Reviewer transfer, no-successor blocking, and authenticated printable portfolio access.

## 22. Delivery, infrastructure, and operations

CI runs formatting, linting, type checking, unit tests, PostgreSQL integration tests, API contract validation, clean-database migration tests, production build, and dependency and secret scanning.

Migrations are version controlled, explicit deployment steps. Template seeds have stable identifiers and immutable versions. After real data exists, use expand-and-contract changes and restartable observable backfills; never apply destructive migrations automatically on application startup.

Use local, isolated CI, and production environments initially. Add previews when stakeholder/frontend collaboration needs them and permanent staging only when release risk justifies it.

Required observability includes structured request and job logs, correlation IDs, error tracking, API and database health, outbox backlog, authentication throttling signals, escalation attempts and blocked transfers, invitation failures, readiness/liveness endpoints, and database/storage cost visibility. Alert thresholds follow measurable service targets rather than invented numbers.

Before real users, prepare and exercise deployment/rollback, database restore, outbox recovery, failed transfer, no-successor recovery, lost-main-Reviewer access, invitation recovery, file quarantine, account/project deletion, retention, credential rotation, and incident runbooks.

## 23. Prioritised decisions

| Category | Decision | Reason or trigger |
| --- | --- | --- |
| **Required now** | TypeScript/Express modular monolith with PostgreSQL | Strong transactional domain without a justified service boundary |
| **Required now** | `pg`, parameterised raw SQL, and `node-pg-migrate` | Direct control over transactions, locking, constraints, and migration SQL |
| **Required now** | Application-owned email/password authentication | Confirmed ownership requirement for accounts and workflows |
| **Required now** | Argon2id and opaque database sessions | Trusted password hashing plus immediate revocation for a browser MVP |
| **Required now** | Project-scoped role enforcement | Primary trust boundary |
| **Required now** | Immutable proposal and submission versions | Decisions must refer to stable content |
| **Required now** | Milestone-level approval aggregate | Confirmed evidence workflow |
| **Required now** | Dynamic current-main-Reviewer authority | Pending work transfers without rewriting history |
| **Required now** | Durable scheduler and outbox runner | Email delivery and automatic Reviewer succession |
| **Required now** | Append-only audit events | Project changes, security actions, and succession must be traceable |
| **Required now** | Printable authenticated portfolio | Confirmed MVP output |
| **Required before Phase 3** | File types, limits, quotas, and scanning policy | Upload implementation depends on them |
| **Required before Phase 4** | Escalation initiator, notice schedule, and transfer timing | Automatic succession depends on them |
| **Required before deadline calculations** | Project timezone and overdue semantics | Prevent inconsistent deadline state |
| **Required before real users** | Deletion, retention, and no-successor recovery | Sensitive data and blocked projects require an operational policy |
| **Required before real users** | Measurable service targets and restore test | Meaningful alerts and recovery commitments depend on them |
| **Add when triggered** | Redis | Only for a demonstrated cache, lock, or rate-limit need |
| **Add when triggered** | External queue | PostgreSQL outbox cannot meet measured job requirements |
| **Add when triggered** | Cached progress projections | Coverage queries become a measured bottleneck |
| **Add when triggered** | Search service | PostgreSQL search becomes inadequate |
| **Add when triggered** | Permanent staging | Release coordination or risk requires it |
| **Add when triggered** | PDF/ZIP worker | Downloadable generated formats enter scope |
| **Not justified** | JWT access tokens | No cross-service portability need; revocation is central |
| **Not justified** | External auth service or auth framework | Trace must own accounts, credentials, sessions, and workflows |
| **Not justified** | Microservices or Kubernetes | No scale, ownership, or orchestration requirement |
| **Not justified** | Event sourcing or CQRS | Version tables and audit events meet the history need |
| **Not justified** | WebSockets | Polling supports MVP notifications |
| **Not justified** | Institution tenancy | Institutions are metadata |
| **Not justified** | Dependency graphs or template admin UI | Explicitly excluded from MVP |
| **Not justified** | Per-evidence approval | Approval occurs at Milestone Submission level |

## 24. Phased roadmap

### Phase 0 — Planning baseline (complete)

The product workflow, architecture, authentication method, and SQL-first persistence approach are selected and documented in this plan. Phase 1 implementation has started.

Decisions are resolved just before the work that depends on them rather than front-loaded unnecessarily:

- file policy before Phase 3 uploads;
- escalation initiation and timing before Phase 4 automatic succession;
- timezone semantics before any deadline calculation work;
- deletion, retention, no-successor recovery, and measurable targets before real users.

### Phase 1 — Foundation, authentication, and access boundary

Build the TypeScript/Express foundation, `pg` database layer, `node-pg-migrate` migrations, full application-owned authentication workflow, project creation, creator provenance, permanent Author role assignment, memberships, invitations, project-scoped authorisation, audit/logging foundation, CI, health endpoints, and the storage interface/configuration boundary only.

Complete when authentication security tests pass, invitation acceptance is atomic, cross-project access tests pass, Author replacement is impossible, role uniqueness survives concurrency, and no upload or object-storage implementation has been introduced.

### Phase 2 — Templates, proposals, and activation

Build four seeded template versions, copied project structure, ordered milestones, proposal versions and decisions, both activation routes, and timeline projections.

Complete when each route activates only under its confirmed conditions, stale decisions fail, and template changes do not affect existing projects.

### Phase 3 — Milestone supervision and uploads

Dependency: approve exact file types, size/quota limits, safe inline image rules, and malware-scanning policy.

Implement private object storage and uploads, Milestone Submission aggregates and versions, evidence items and mappings, feedback, revision and approval, reciprocal notifications, and progress queries.

Complete when submissions cannot span milestones, uploaded files obey the approved policy, attachments have no independent approval state, revisions preserve history, and dormant Reviewers remain read-only and notification-suppressed.

### Phase 4 — Changes and Reviewer succession

Dependency: approve escalation initiator, notice count/schedule, response period, and exact automatic-transfer timing.

Build minor-edit history, major-change proposals, dormant membership and succession order, manual promotion, durable escalation attempts, automatic transfer, and `BLOCKED_NO_SUCCESSOR` state.

Complete when transfer is atomic and idempotent, exactly one main Reviewer remains, former authority ends immediately, pending responsibilities follow the active role, and every attempt and reason appears in history.

### Phase 5 — Final workflow, deadlines, and portfolio

Dependency for deadline calculations: approve project timezone and precise overdue semantics.

Build deliverable versions, deadline projections, final checklist, final request and decision, invalidation behavior, final portfolio snapshot, and printable authenticated web view.

Complete when all final conditions are enforced, deliverables alone cannot complete a project, only the current main Reviewer can approve, and portfolio/file access follows the approved snapshot and security rules.

### Phase 6 — Release readiness

Before inviting real users, decide and implement deletion, retention, no-successor and lost-main-Reviewer recovery, and measurable service targets. Exercise backup restoration, scheduler recovery, alerting, deployment/rollback, privacy operations, security testing, and all principal end-to-end workflows.

## 25. Risks and unresolved decisions

Remaining unresolved decisions are:

- account and project deletion;
- data retention;
- exact file types, size limits, quotas, and scanning policy;
- project timezone and precise overdue semantics;
- the event or person authorised to initiate Reviewer inactivity escalation;
- exact Reviewer notice count, response period, and transfer timing;
- audited recovery when no dormant successor exists;
- recovery when the active main Reviewer loses access outside the normal inactivity process;
- measurable non-functional targets.

Do not invent defaults. Resolve each at its roadmap decision gate. Safety-dependent production behavior—particularly uploads, automatic transfer, deletion, and recovery—must not be enabled before its policy is approved.

Principal engineering risks are semantic misclassification of project changes, mutable reviewed content, cross-project access leakage, duplicate Reviewer transfer, misleading progress, unsafe uploads, inconsistent portfolio snapshots, notification duplication, unbounded history growth, and authentication implementation defects. The state models, database constraints, immutable versions, transactional outbox, security design, and decision gates in this plan are the corresponding mitigations.

## 26. Later review evidence

A later review should verify in code, migrations, tests, CI, deployment, and operations that:

- authentication follows the selected Argon2id and opaque-session design without custom cryptographic algorithms;
- raw SQL is parameterised, project-scoped, and executed through explicit pool or transaction-client boundaries;
- `node-pg-migrate` migrations are the version-controlled schema authority and verify clean-database setup;
- raw credentials and tokens never enter persistence or logs;
- CSRF, session rotation, expiration, and revocation are enforced;
- project creation and permanent authorship are distinct concepts;
- access always derives from explicit membership;
- exactly one active main Reviewer is database-enforced;
- dormant Reviewers are read-only and excluded from routine notifications;
- both activation routes match their state machines;
- proposal and submission decisions reference immutable versions;
- Milestone Submissions cannot span milestones and evidence is not approved independently;
- final completion enforces every confirmed condition;
- Reviewer transfer is atomic, idempotent, fully audited, and recoverable;
- portfolio rendering respects snapshot and file-access rules;
- object storage was introduced only with an approved upload policy;
- migrations, restore, deployment, and operational recovery were exercised rather than merely documented.
