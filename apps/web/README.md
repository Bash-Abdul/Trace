# Trace web prototype

A clickable, responsive visual prototype of the Author / main Reviewer workflow described in `../api/docs/backend-engineering-plan.md`. React, TypeScript, Vite, React Router, Lucide icons, and locally bundled DM Sans / Newsreader fonts.

Run from the repository root:

```sh
pnpm install
pnpm dev:web
```

Open http://127.0.0.1:5173 for the public landing page, then enter the demo at `/overview`. Choose Author or Reviewer in the workspace top bar. Explore project creation, invitation acceptance, proposal approval, draft evidence, milestone submission and revisions, feedback resolution, final approval, and printable process portfolios. Settings can restore the original fictional projects.

## Architecture

- `src/app`: routing, application shell, demo state provider, global styles.
- `src/modules/landing`: responsive public landing page and product previews.
- `src/modules/dashboard`: workspace overview.
- `src/modules/projects`: project pages/components, typed domain model, fixtures, and pure workflow transitions.
- `src/modules/submissions`: milestone editor, evidence previews, version history.
- `src/modules/feedback`: conversations and review queue.
- `src/modules/activity`: shared activity timeline.
- `src/modules/portfolio`: live / completed record and print layout.
- `src/modules/settings`: demo data controls.
- `src/shared/ui`: reusable visual primitives.

`DemoProvider` is the mock data boundary. Components use its typed operations; workflow rules live in `projects/model/workflow.ts`. Local storage is schema-validated and uses the single key `trace.visual-demo.v1`. Backend integration should replace this boundary with server-backed queries/mutations and enforce permissions on the server.

## Scope and deliberate limitations

This is fictional browser data, not a production frontend or an auth integration. The backend is untouched. The persona selector is a demonstration control, not authorization. Evidence documents and final deliverables are samples; no files are uploaded, emails sent, or API requests made. External evidence links open only HTTP(S) URLs.

The four template labels are illustrative: the plan does not specify their final names. The invitation flow simulates one fixed Reviewer. Proposal editing, real membership/succession management, auth screens, and actual uploads remain integration work. Completed demo projects are locked, preserving their final record in browser storage; production snapshots need durable server storage. Browser reset clears this demo's projects, including completed records.

Milestone counts are shown instead of an invented combined project percentage. Author-addressed feedback remains unresolved until the Reviewer resolves it. Submitted evidence is copied into version history; revisions start a new version.

## Checks

```sh
pnpm --filter @trace/web typecheck
pnpm --filter @trace/web lint
pnpm --filter @trace/web test
pnpm --filter @trace/web build
pnpm --filter @trace/web test:e2e
```

Browser tests use Playwright Chromium (`pnpm --filter @trace/web exec playwright install chromium` if needed), start a local Vite server, and cover the interactive workflow and mobile navigation. No production accounts or services are needed.
