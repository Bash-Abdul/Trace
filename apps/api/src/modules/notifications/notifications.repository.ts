import type { Database } from '../../config/db.js';
import type { PoolClient } from 'pg';
import type { Role } from '../projects/projects.types.js';
import type { Notification } from './notifications.types.js';

export async function enqueue(
  client: PoolClient,
  projectId: string,
  actorId: string,
  action: string,
  roles: Role[],
  details: object = {},
  milestoneId: string | null = null,
) {
  await client.query(
    `INSERT INTO project_notifications (project_id, milestone_id, recipient_id, action, details)
     SELECT project_id, $6, user_id, $3, $5::jsonb
     FROM project_memberships
     WHERE project_id = $1 AND user_id <> $2 AND role = ANY($4::text[])`,
    [projectId, actorId, action, roles, JSON.stringify(details), milestoneId],
  );
}

// Membership filtering applies to reads AND updates, including cursor lookups.
const visible = `n.recipient_id = $1 AND EXISTS (
  SELECT 1 FROM project_memberships m
  WHERE m.project_id = n.project_id AND m.user_id = $1 AND m.role = ANY($2::text[])
)`;
export async function list(
  db: Database,
  userId: string,
  roles: Role[],
  before: string | undefined,
  limit: number,
) {
  return (
    await db.query<Notification>(
      `SELECT n.id, n.project_id, p.title AS project_title,
      n.milestone_id, pm.title AS milestone_title, n.action, n.details, n.created_at, n.read_at
     FROM project_notifications n
     JOIN projects p ON p.id = n.project_id
     LEFT JOIN project_milestones pm ON pm.id = n.milestone_id
     WHERE ${visible}
       AND ($3::uuid IS NULL OR (n.created_at, n.id) < (
         SELECT n.created_at, n.id FROM project_notifications n
         WHERE n.id = $3 AND ${visible}
       ))
     ORDER BY n.created_at DESC, n.id DESC LIMIT $4`,
      [userId, roles, before ?? null, limit],
    )
  ).rows;
}
export async function unreadCount(db: Database, userId: string, roles: Role[]) {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM project_notifications n WHERE ${visible} AND n.read_at IS NULL`,
    [userId, roles],
  );
  return result.rows[0]!.count;
}
export async function setRead(
  db: Database,
  userId: string,
  roles: Role[],
  id: string,
  read: boolean,
) {
  const result = await db.query(
    `UPDATE project_notifications n SET read_at = CASE WHEN $4 THEN COALESCE(read_at, now()) ELSE NULL END
     WHERE ${visible} AND n.id = $3 RETURNING id`,
    [userId, roles, id, read],
  );
  return result.rowCount === 1;
}
export async function readAll(db: Database, userId: string, roles: Role[]) {
  await db.query(
    `UPDATE project_notifications n SET read_at = now() WHERE ${visible} AND n.read_at IS NULL`,
    [userId, roles],
  );
}
