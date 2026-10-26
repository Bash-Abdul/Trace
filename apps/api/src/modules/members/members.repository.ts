import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import type { Membership } from './members.types.js';
export async function member(db: Database, projectId: string, userId: string) {
  return (
    (
      await db.query<Membership>(
        `SELECT user_id, role, joined_at FROM project_memberships
    WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId],
      )
    ).rows[0] ?? null
  );
}
export async function recordRemoval(
  db: PoolClient,
  projectId: string,
  target: Membership,
  actorId: string,
  reason: string,
) {
  await db.query(
    `INSERT INTO project_membership_removals (project_id, user_id, role, joined_at, removed_by, reason)
    VALUES ($1, $2, $3, $4, $5, $6)`,
    [projectId, target.user_id, target.role, target.joined_at, actorId, reason],
  );
}
export async function removeAccess(
  db: PoolClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  return (
    (
      await db.query(
        `DELETE FROM project_memberships
    WHERE project_id = $1 AND user_id = $2 AND role = 'AUTHOR'`,
        [projectId, userId],
      )
    ).rowCount === 1
  );
}
export async function changeRole(
  db: PoolClient,
  projectId: string,
  userId: string,
  before: 'LEAD_AUTHOR' | 'AUTHOR',
  after: 'LEAD_AUTHOR' | 'AUTHOR',
): Promise<boolean> {
  return (
    (
      await db.query(
        `UPDATE project_memberships SET role = $4
    WHERE project_id = $1 AND user_id = $2 AND role = $3`,
        [projectId, userId, before, after],
      )
    ).rowCount === 1
  );
}
export async function cancelIssuedInvitations(
  db: PoolClient,
  projectId: string,
  userId: string,
): Promise<string[]> {
  return (
    await db.query<{ id: string }>(
      `UPDATE project_invitations SET cancelled_at = now()
    WHERE project_id = $1 AND invited_by_user_id = $2 AND consumed_at IS NULL AND cancelled_at IS NULL
    RETURNING id`,
      [projectId, userId],
    )
  ).rows.map((row) => row.id);
}
export async function isFormerAuthor(
  db: Database,
  projectId: string,
  email: string,
): Promise<boolean> {
  return Boolean(
    (
      await db.query(
        `SELECT 1 FROM project_membership_removals h
    JOIN users u ON u.id = h.user_id WHERE h.project_id = $1 AND u.email = $2 LIMIT 1`,
        [projectId, email],
      )
    ).rowCount,
  );
}
