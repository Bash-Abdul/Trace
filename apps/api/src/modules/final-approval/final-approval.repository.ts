import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import type { FinalRequest, Snapshot, RequestInput } from './final-approval.types.js';
export async function requests(db: Database, projectId: string) {
  return (
    await db.query<FinalRequest>(
      'SELECT * FROM final_approval_requests WHERE project_id = $1 ORDER BY number DESC',
      [projectId],
    )
  ).rows;
}
export async function approvals(db: Database, projectId: string) {
  return (
    await db.query<{ milestoneId: string; submissionId: string }>(
      `
    SELECT m.id AS "milestoneId", v.id AS "submissionId"
    FROM project_milestones m
    JOIN milestone_submissions s ON s.milestone_id = m.id
    JOIN LATERAL (
      SELECT id, decision
      FROM milestone_submission_versions
      WHERE milestone_id = m.id
      ORDER BY number DESC
      LIMIT 1
    ) v ON true
    WHERE m.project_id = $1 AND m.archived_at IS NULL
      AND s.state = 'APPROVED' AND v.decision = 'APPROVE'
    ORDER BY m.position`,
      [projectId],
    )
  ).rows;
}
export async function pendingChanges(db: Database, projectId: string): Promise<boolean> {
  return !!(
    await db.query(
      "SELECT 1 FROM project_changes WHERE project_id = $1 AND state = 'PROPOSED' LIMIT 1",
      [projectId],
    )
  ).rowCount;
}
export async function insert(
  db: PoolClient,
  projectId: string,
  userId: string,
  input: RequestInput,
  snapshot: Snapshot,
): Promise<FinalRequest> {
  const result = await db.query<FinalRequest>(
    `
    INSERT INTO final_approval_requests
      (project_id, number, state, base_version, snapshot, requested_by, request_key)
    SELECT $1, COALESCE(MAX(number), 0) + 1, 'PENDING', $2, $3, $4, $5
    FROM final_approval_requests
    WHERE project_id = $1
    RETURNING *`,
    [projectId, input.version, JSON.stringify(snapshot), userId, input.key],
  );
  return result.rows[0]!;
}
export async function close(
  db: PoolClient,
  requestId: string,
  userId: string,
  state: FinalRequest['state'],
  feedback: string,
  key: string | null = null,
): Promise<boolean> {
  return (
    (
      await db.query(
        `UPDATE final_approval_requests
        SET state = $2, feedback = $3, decided_by = $4, decided_at = now(), decision_key = $5
        WHERE id = $1 AND state = 'PENDING'`,
        [requestId, state, feedback, userId, key],
      )
    ).rowCount === 1
  );
}
export async function setStatus(
  db: PoolClient,
  projectId: string,
  from: string,
  to: string,
): Promise<boolean> {
  return (
    (
      await db.query(
        `UPDATE projects
        SET status = $3, version = version + 1, updated_at = now()
        WHERE id = $1 AND status = $2`,
        [projectId, from, to],
      )
    ).rowCount === 1
  );
}
export async function invalidate(
  db: PoolClient,
  projectId: string,
  userId: string,
): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `UPDATE final_approval_requests
    SET state = 'INVALIDATED', feedback = 'Project work changed after this request.',
      decided_by = $2, decided_at = now()
    WHERE project_id = $1 AND state = 'PENDING'
    RETURNING id`,
    [projectId, userId],
  );
  return result.rows[0]?.id ?? null;
}
export async function savePortfolio(
  db: PoolClient,
  projectId: string,
  requestId: string,
  manifest: object,
) {
  await db.query(
    'INSERT INTO final_portfolio_snapshots(project_id,request_id,manifest) VALUES($1,$2,$3)',
    [projectId, requestId, JSON.stringify(manifest)],
  );
}
// The manifest includes histories by stable identifiers; the printable renderer is a later increment.
export async function historyIds(db: Database, projectId: string) {
  const milestones = (
    await db.query<{ id: string }>(
      `SELECT v.id
      FROM milestone_submission_versions v
      JOIN project_milestones m ON m.id = v.milestone_id
      WHERE m.project_id = $1
      ORDER BY v.submitted_at, v.id`,
      [projectId],
    )
  ).rows;
  const deliverables = (
    await db.query<{ id: string }>(
      `SELECT v.id
      FROM deliverable_submission_versions v
      JOIN project_deliverables d ON d.id = v.deliverable_id
      WHERE d.project_id = $1
      ORDER BY v.submitted_at, v.id`,
      [projectId],
    )
  ).rows;
  const feedback = (
    await db.query(
      `SELECT f.*
      FROM milestone_feedback f
      JOIN milestone_submission_versions v ON v.id = f.submission_version_id
      JOIN project_milestones m ON m.id = v.milestone_id
      WHERE m.project_id = $1
      ORDER BY f.created_at, f.id`,
      [projectId],
    )
  ).rows;
  const messages = (
    await db.query<{ id: string }>(
      `SELECT msg.id
      FROM milestone_feedback_messages msg
      JOIN milestone_feedback f ON f.id = msg.feedback_id
      JOIN milestone_submission_versions v ON v.id = f.submission_version_id
      JOIN project_milestones m ON m.id = v.milestone_id
      WHERE m.project_id = $1
      ORDER BY msg.created_at, msg.id`,
      [projectId],
    )
  ).rows;
  const changes = (
    await db.query<{ id: string }>(
      `SELECT id
      FROM project_changes
      WHERE project_id = $1
      ORDER BY created_at, id`,
      [projectId],
    )
  ).rows;
  return {
    milestoneVersionIds: milestones.map((r) => r.id),
    deliverableVersionIds: deliverables.map((r) => r.id),
    feedback,
    feedbackMessageIds: messages.map((r) => r.id),
    changeIds: changes.map((r) => r.id),
  };
}
