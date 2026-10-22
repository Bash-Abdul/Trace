import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import type { Role } from '../projects/projects.types.js';
import type {
  Decision,
  Detail,
  Evidence,
  Feedback,
  FeedbackMessage,
  NewFeedback,
  State,
  Submission,
} from './milestones.types.js';

export async function milestone(
  database: Database,
  projectId: string,
  milestoneId: string,
): Promise<Detail['milestone'] | null> {
  const result = await database.query<Detail['milestone']>(
    `SELECT id, title, required FROM project_milestones
     WHERE id = $1 AND project_id = $2`,
    [milestoneId, projectId],
  );
  return result.rows[0] ?? null;
}

export async function state(
  database: Database,
  milestoneId: string,
): Promise<{ version: number; state: State }> {
  const result = await database.query<{ version: number; state: State }>(
    'SELECT version, state FROM milestone_submissions WHERE milestone_id = $1',
    [milestoneId],
  );
  return result.rows[0] ?? { version: 0, state: 'NOT_STARTED' };
}

export async function evidence(database: Database, milestoneId: string): Promise<Evidence[]> {
  const result = await database.query<Evidence>(
    `SELECT id, title, kind, content, created_by, updated_by
     FROM milestone_draft_evidence WHERE milestone_id = $1 ORDER BY position`,
    [milestoneId],
  );
  return result.rows;
}

export async function saveDraft(
  client: PoolClient,
  milestoneId: string,
  items: Evidence[],
): Promise<void> {
  await client.query(
    `INSERT INTO milestone_submissions (milestone_id) VALUES ($1)
     ON CONFLICT (milestone_id) DO NOTHING`,
    [milestoneId],
  );
  await client.query(
    `DELETE FROM milestone_draft_evidence
     WHERE milestone_id = $1 AND NOT (id = ANY($2::uuid[]))`,
    [milestoneId, items.map((item) => item.id)],
  );
  await client.query(
    `INSERT INTO milestone_draft_evidence
       (id, milestone_id, position, title, kind, content, created_by, updated_by)
     SELECT (item->>'id')::uuid, $1, (ordinality - 1)::integer,
       item->>'title', item->>'kind', item->>'content',
       (item->>'created_by')::uuid, (item->>'updated_by')::uuid
     FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS incoming(item, ordinality)
     ON CONFLICT (id) DO UPDATE SET
       position = EXCLUDED.position, title = EXCLUDED.title, kind = EXCLUDED.kind,
       content = EXCLUDED.content, updated_by = EXCLUDED.updated_by`,
    [milestoneId, JSON.stringify(items)],
  );
}

export async function transition(
  client: PoolClient,
  milestoneId: string,
  version: number,
  next: State,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE milestone_submissions SET state = $3, version = version + 1
     WHERE milestone_id = $1 AND version = $2`,
    [milestoneId, version, next],
  );
  return result.rowCount === 1;
}

export async function versions(database: Database, milestoneId: string): Promise<Submission[]> {
  const result = await database.query<Submission>(
    `SELECT id, number, evidence, submitted_by, submitted_at, decision, feedback, decided_by, decided_at
     FROM milestone_submission_versions WHERE milestone_id = $1 ORDER BY number DESC`,
    [milestoneId],
  );
  return result.rows;
}

export async function submit(
  client: PoolClient,
  milestoneId: string,
  items: Evidence[],
  userId: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO milestone_submission_versions (milestone_id, number, evidence, submitted_by)
     SELECT $1, COALESCE(MAX(number), 0) + 1, $2::jsonb, $3
     FROM milestone_submission_versions WHERE milestone_id = $1
     RETURNING id`,
    [milestoneId, JSON.stringify(items), userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Submission insert returned no row');
  }
  return row.id;
}

export async function decide(
  client: PoolClient,
  milestoneId: string,
  submissionId: string,
  userId: string,
  input: Decision,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE milestone_submission_versions
     SET decision = $3, feedback = $4, decided_by = $5, decided_at = now()
     WHERE id = $1 AND milestone_id = $2 AND decision IS NULL`,
    [submissionId, milestoneId, input.decision, input.feedback, userId],
  );
  return result.rowCount === 1;
}

export async function feedback(database: Database, milestoneId: string): Promise<Feedback[]> {
  const result = await database.query<Feedback>(
    `SELECT f.id, f.submission_version_id, f.body, f.blocking, f.state, f.version, f.created_by, f.created_at
     FROM milestone_feedback f
     JOIN milestone_submission_versions s ON s.id = f.submission_version_id
     WHERE s.milestone_id = $1 ORDER BY f.created_at, f.id`,
    [milestoneId],
  );
  return result.rows;
}

export async function messages(
  database: Database,
  milestoneId: string,
): Promise<FeedbackMessage[]> {
  const result = await database.query<FeedbackMessage>(
    `SELECT m.id, m.feedback_id, m.author_id, m.body, m.created_at
     FROM milestone_feedback_messages m
     JOIN milestone_feedback f ON f.id = m.feedback_id
     JOIN milestone_submission_versions s ON s.id = f.submission_version_id
     WHERE s.milestone_id = $1 ORDER BY m.created_at, m.id`,
    [milestoneId],
  );
  return result.rows;
}

export async function addFeedback(
  client: PoolClient,
  submissionId: string,
  userId: string,
  input: NewFeedback,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO milestone_feedback (submission_version_id, body, blocking, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [submissionId, input.body, input.blocking, userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Feedback insert returned no row');
  }
  return row.id;
}

export async function updateFeedback(
  client: PoolClient,
  feedbackId: string,
  version: number,
  state: Feedback['state'],
  userId: string,
  body: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE milestone_feedback SET state = $3, version = version + 1
     WHERE id = $1 AND version = $2`,
    [feedbackId, version, state],
  );
  if (result.rowCount !== 1) {
    return false;
  }
  await client.query(
    `INSERT INTO milestone_feedback_messages (feedback_id, author_id, body) VALUES ($1, $2, $3)`,
    [feedbackId, userId, body],
  );
  return true;
}

export async function notify(
  client: PoolClient,
  projectId: string,
  milestoneId: string,
  actorId: string,
  action: string,
  roles: Role[],
): Promise<void> {
  await client.query(
    `INSERT INTO project_notifications (project_id, milestone_id, recipient_id, action)
     SELECT project_id, $2, user_id, $4 FROM project_memberships
     WHERE project_id = $1 AND user_id <> $3 AND role = ANY($5::text[])`,
    [projectId, milestoneId, actorId, action, roles],
  );
}

export async function notifications(
  database: Database,
  projectId: string,
  userId: string,
): Promise<{ id: string; milestone_id: string; action: string; created_at: Date }[]> {
  const result = await database.query<{
    id: string;
    milestone_id: string;
    action: string;
    created_at: Date;
  }>(
    `SELECT id, milestone_id, action, created_at FROM project_notifications
     WHERE project_id = $1 AND recipient_id = $2 ORDER BY created_at DESC, id LIMIT 100`,
    [projectId, userId],
  );
  return result.rows;
}
