import type { Database } from '../../config/db.js';
import type { Role } from '../projects/projects.types.js';
import type { QueueRecord } from './reviews.types.js';
export async function proposals(db: Database, userId: string, roles: Role[], limit: number) {
  return (
    await db.query<QueueRecord>(
      `
    SELECT v.id, p.id AS project_id, p.title AS project_title, m.role,
      NULL::uuid AS milestone_id, NULL::text AS milestone_title,
      v.version AS number, p.status AS state, v.feedback AS body,
      false AS blocking, COALESCE(v.decided_at, v.submitted_at) AS updated_at
    FROM projects p
    JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1
    JOIN LATERAL (
      SELECT id, version, feedback, submitted_at, decided_at
      FROM project_proposals WHERE project_id = p.id ORDER BY version DESC LIMIT 1
    ) v ON true
    WHERE m.role = ANY($2::text[])
      AND p.status IN ('PROPOSAL_IN_REVIEW', 'PROPOSAL_CHANGES_REQUESTED')
    ORDER BY updated_at DESC, v.id
    LIMIT $3`,
      [userId, roles, limit],
    )
  ).rows;
}
export async function submissions(db: Database, userId: string, roles: Role[], limit: number) {
  return (
    await db.query<QueueRecord>(
      `
    SELECT v.id, p.id AS project_id, p.title AS project_title, m.role,
      pm.id AS milestone_id, pm.title AS milestone_title,
      v.number, s.state, v.feedback AS body, false AS blocking,
      COALESCE(v.decided_at, v.submitted_at) AS updated_at
    FROM projects p
    JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1
    JOIN project_milestones pm ON pm.project_id = p.id
    JOIN milestone_submissions s ON s.milestone_id = pm.id
    JOIN LATERAL (
      SELECT id, number, decision, feedback, submitted_at, decided_at
      FROM milestone_submission_versions WHERE milestone_id = pm.id ORDER BY number DESC LIMIT 1
    ) v ON true
    WHERE m.role = ANY($2::text[]) AND p.status = 'ACTIVE'
      AND pm.archived_at IS NULL
      AND (s.state IN ('AWAITING_REVIEW', 'REVISION_REQUESTED')
        OR (s.state = 'DRAFT' AND v.decision = 'REQUEST_REVISION'))
    ORDER BY updated_at DESC, v.id
    LIMIT $3`,
      [userId, roles, limit],
    )
  ).rows;
}
export async function feedback(db: Database, userId: string, roles: Role[], limit: number) {
  return (
    await db.query<QueueRecord>(
      `
    SELECT f.id, p.id AS project_id, p.title AS project_title, m.role,
      pm.id AS milestone_id, pm.title AS milestone_title,
      v.number, f.state, f.body, f.blocking,
      COALESCE((SELECT max(created_at) FROM milestone_feedback_messages WHERE feedback_id = f.id), f.created_at) AS updated_at
    FROM projects p
    JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1
    JOIN project_milestones pm ON pm.project_id = p.id
    JOIN milestone_submission_versions v ON v.milestone_id = pm.id
    JOIN milestone_feedback f ON f.submission_version_id = v.id
    WHERE m.role = ANY($2::text[]) AND p.status = 'ACTIVE'
      AND f.state <> 'RESOLVED_BY_REVIEWER'
    ORDER BY updated_at DESC, f.id
    LIMIT $3`,
      [userId, roles, limit],
    )
  ).rows;
}

export async function changes(db: Database, userId: string, roles: Role[], limit: number) {
  return (
    await db.query<QueueRecord>(
      `SELECT c.id, p.id AS project_id, p.title AS project_title, m.role,
    NULL::uuid AS milestone_id, NULL::text AS milestone_title, c.version AS number,
    c.state, c.reason AS body, false AS blocking, c.updated_at
    FROM project_changes c JOIN projects p ON p.id = c.project_id
    JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $1
    WHERE m.role = ANY($2::text[]) AND c.state = 'PROPOSED'
    ORDER BY c.updated_at DESC, c.id LIMIT $3`,
      [userId, roles, limit],
    )
  ).rows;
}

export async function finalApprovals(db: Database, userId: string, roles: Role[], limit: number) {
  return (
    await db.query<QueueRecord>(
      `
    SELECT f.id,p.id AS project_id,p.title AS project_title,m.role,
      NULL::uuid AS milestone_id,NULL::text AS milestone_title,f.number,f.state,f.feedback AS body,
      false AS blocking,COALESCE(f.decided_at,f.requested_at) AS updated_at
    FROM final_approval_requests f JOIN projects p ON p.id=f.project_id
    JOIN project_memberships m ON m.project_id=p.id AND m.user_id=$1
    WHERE m.role=ANY($2::text[]) AND p.status IN ('ACTIVE','FINAL_APPROVAL_PENDING')
      AND f.number=(SELECT max(number) FROM final_approval_requests WHERE project_id=p.id)
      AND f.state IN ('PENDING','REVISION_REQUESTED','INVALIDATED')
    ORDER BY updated_at DESC,f.id LIMIT $3`,
      [userId, roles, limit],
    )
  ).rows;
}
