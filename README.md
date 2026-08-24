# Trace

Trace is a project supervision and evidence platform for long-running assessed projects where the development process matters alongside the final outcome.

It gives an Author and their assigned Reviewers a structured record of project expectations, milestone submissions, evidence, feedback, revisions, decisions, deliverables, and final approval. The resulting project history becomes a printable Process Portfolio.

> **Status:** Planning is complete and Phase 1 has started with the initial API foundation. Authentication, persistence, project access, and CI are still to be completed.

## Why Trace?

Long-running projects are often produced across tools such as Word, GitHub, Figma, and Jupyter. Those tools contain parts of the work, but they do not provide one reliable account of:

- what the project was expected to achieve;
- how its plan changed;
- what evidence supports each milestone;
- how Reviewer feedback was addressed;
- which versions were reviewed and approved;
- whether final requirements have been satisfied.

Trace connects those records without trying to replace the tools used to create the work.

## Core workflow

1. An Author or Reviewer creates a project from one of four built-in templates.
2. The other required participant joins through an email-bound invitation.
3. The project activates through either in-platform proposal approval or prior external approval.
4. The Author completes work in their normal external tools.
5. The Author submits a separate evidence package for each milestone.
6. The active main Reviewer approves the submission or requests a revision.
7. The Author responds to feedback and submits revised versions where needed.
8. Trace tracks milestone coverage, unresolved feedback, changes, deadlines, and missing requirements.
9. The Author submits required deliverables and requests final approval.
10. The active main Reviewer makes the final decision.
11. Trace presents the completed project as a printable Process Portfolio.

## Project roles

- **Author:** The permanent person responsible for the assessed work. A Reviewer may create the project and invite the Author.
- **Active main Reviewer:** The single Reviewer authorised to make proposal, milestone, change, and final-approval decisions.
- **Dormant sub-reviewer:** A read-only project member who may be placed in an explicit Reviewer succession order.

Roles are project-specific. A person may be an Author on one project and a Reviewer on another, including across different institutions.

## Approval routes

- **`IN_PLATFORM_PROPOSAL`:** The Author proposes the project in Trace. It activates after both required participants join and the active main Reviewer approves the proposal.
- **`EXTERNALLY_APPROVED`:** The project was approved elsewhere. It activates automatically after its Author and active main Reviewer join.

## MVP scope

- Application-owned email/password authentication
- Project-scoped membership and permissions
- Project creation and email-bound invitations
- Four version-controlled project templates
- Customisable objectives, ordered milestones, expected evidence, and deliverables
- Versioned Milestone Submissions containing text, links, explanations, and files
- Reviewer feedback, Author responses, approvals, and revision cycles
- Minor-edit history and approval of major project changes
- Reviewer succession and audited inactivity transfer
- Progress, coverage, deadline, and final-checklist calculations
- In-application workflow notifications
- Final deliverable submission and final approval
- Timeline, version history, and printable Process Portfolio

## Architecture

Trace is planned as a TypeScript and Express modular monolith backed by PostgreSQL. This keeps permissions, approvals, revisions, notifications, and Reviewer transfers within reliable database transactions while avoiding premature distributed-system complexity.

Planned supporting infrastructure includes:

- `pg` with parameterised raw SQL and `node-pg-migrate` for version-controlled migrations;
- Zod validation and an OpenAPI REST contract;
- Argon2id password hashing;
- opaque, database-backed browser sessions in secure HTTP-only cookies;
- private S3-compatible object storage for evidence and deliverables;
- a durable PostgreSQL outbox and scheduled runner for email and Reviewer succession.

JWTs, microservices, Kubernetes, real-time chat, institution tenancy, AI assessment, and generated PDF/ZIP portfolios are not part of the MVP architecture.

## Roadmap

1. Foundation, authentication, invitations, and project access
2. Templates, proposals, and project activation
3. Milestone supervision, evidence uploads, feedback, and progress
4. Project changes and Reviewer succession
5. Final approval, deadlines, and printable Process Portfolio
6. Release readiness, recovery, privacy, and operational hardening

## Documentation

The authoritative product rules, architecture, application design, data model, security controls, testing strategy, infrastructure approach, and phased roadmap are documented in the [backend engineering plan](apps/api/docs/backend-engineering-plan.md).

## Non-goals

Trace does not write project content, assess quality, grade work, detect plagiarism, replace creation tools, or provide institution-wide workflow administration.
