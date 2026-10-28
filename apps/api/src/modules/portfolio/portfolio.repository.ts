import type { Database } from '../../config/db.js';
import type { Manifest, Records, Portfolio } from './portfolio.types.js';
export async function snapshot(db: Database, projectId: string) {
  return (
    (
      await db.query<{ manifest: Manifest; recordedAt: string }>(
        `
    SELECT manifest, created_at::text AS "recordedAt"
    FROM final_portfolio_snapshots WHERE project_id = $1`,
        [projectId],
      )
    ).rows[0] ?? null
  );
}
export async function records(db: Database, projectId: string): Promise<Records> {
  const submissions = (
    await db.query<Records['submissions'][number]>(
      `
    SELECT v.* FROM milestone_submission_versions v
    JOIN project_milestones m ON m.id = v.milestone_id
    WHERE m.project_id = $1 ORDER BY v.number, v.id`,
      [projectId],
    )
  ).rows;
  const deliverables = (
    await db.query<Records['deliverables'][number]>(
      `
    SELECT v.* FROM deliverable_submission_versions v
    JOIN project_deliverables d ON d.id = v.deliverable_id
    WHERE d.project_id = $1 ORDER BY v.number, v.id`,
      [projectId],
    )
  ).rows;
  const feedback = (
    await db.query<Records['feedback'][number]>(
      `
    SELECT f.* FROM milestone_feedback f
    JOIN milestone_submission_versions v ON v.id = f.submission_version_id
    JOIN project_milestones m ON m.id = v.milestone_id
    WHERE m.project_id = $1 ORDER BY f.created_at, f.id`,
      [projectId],
    )
  ).rows;
  const messages = (
    await db.query<Records['messages'][number]>(
      `
    SELECT msg.* FROM milestone_feedback_messages msg
    JOIN milestone_feedback f ON f.id = msg.feedback_id
    JOIN milestone_submission_versions v ON v.id = f.submission_version_id
    JOIN project_milestones m ON m.id = v.milestone_id
    WHERE m.project_id = $1 ORDER BY msg.created_at, msg.id`,
      [projectId],
    )
  ).rows;
  const changes = (
    await db.query<Records['changes'][number]>(
      `
    SELECT * FROM project_changes WHERE project_id = $1 ORDER BY created_at, id`,
      [projectId],
    )
  ).rows;
  const events = (
    await db.query<Records['events'][number]>(
      `
    SELECT e.id, e.action, e.details, e.created_at::text AS created_at, u.email AS actor
    FROM project_events e JOIN users u ON u.id = e.actor_user_id
    WHERE e.project_id = $1 ORDER BY e.created_at, e.id`,
      [projectId],
    )
  ).rows;
  return { submissions, deliverables, feedback, messages, changes, events };
}
export async function drafts(db: Database, projectId: string) {
  return (
    await db.query<Portfolio['drafts'][number]>(
      `
    SELECT e.* FROM milestone_draft_evidence e
    JOIN project_milestones m ON m.id = e.milestone_id
    JOIN milestone_submissions s ON s.milestone_id = m.id
    WHERE m.project_id = $1 AND m.archived_at IS NULL AND s.state IN ('DRAFT','REVISION_REQUESTED')
    ORDER BY m.position, e.position, e.id`,
      [projectId],
    )
  ).rows;
}
