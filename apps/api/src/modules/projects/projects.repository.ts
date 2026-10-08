import type { PoolClient } from 'pg';
import { notFound } from '../../utils/app-error.js';
import type { ProjectRole } from './projects.schema.js';

export interface Project {
  id: string;
  title: string;
  author_user_id: string | null;
  created_by_user_id: string;
  approval_route: 'IN_PLATFORM_PROPOSAL' | 'EXTERNALLY_APPROVED';
  status: 'SETUP';
  version: number;
  created_at: Date;
}
export interface Invitation {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  accepted_at: Date | null;
  cancelled_at: Date | null;
  accepted_by_user_id: string | null;
  expires_at: Date;
}
export async function requireProject(client: PoolClient, projectId: string, userId: string) {
  // Lock the project before inspecting roles, serializing invitation transitions.
  await client.query(
    `SELECT p.id FROM projects p WHERE p.id = $1 AND EXISTS (
    SELECT 1 FROM project_memberships WHERE project_id = p.id AND user_id = $2
  ) FOR UPDATE OF p`,
    [projectId, userId],
  );
  // Re-read membership after acquiring the lock so a queued request never uses
  // role information from before a concurrent membership transition committed.
  const result = await client.query<Project & { role: ProjectRole }>(
    `SELECT p.*, m.role FROM projects p
    JOIN project_memberships m ON m.project_id = p.id AND m.user_id = $2
    WHERE p.id = $1`,
    [projectId, userId],
  );
  const project = result.rows[0];
  if (!project) throw notFound('Project not found');
  return project;
}
export async function recordProjectEvent(
  client: PoolClient,
  projectId: string,
  actorId: string,
  event: string,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO project_audit_events
    (project_id, actor_user_id, event) VALUES ($1, $2, $3) RETURNING id`,
    [projectId, actorId, event],
  );
  // Dormant Reviewers never receive ordinary workflow notifications.
  await client.query(
    `INSERT INTO project_notifications (project_id, recipient_user_id, audit_event_id, event)
    SELECT project_id, user_id, $3, $4 FROM project_memberships
    WHERE project_id = $1 AND user_id <> $2 AND role <> 'DORMANT_REVIEWER'`,
    [projectId, actorId, result.rows[0]!.id, event],
  );
}
export async function projectDetail(client: PoolClient, projectId: string, userId: string) {
  const project = await requireProject(client, projectId, userId);
  const members = await client.query<{ user_id: string; role: ProjectRole; joined_at: Date }>(
    'SELECT user_id, role, joined_at FROM project_memberships WHERE project_id = $1 ORDER BY joined_at, user_id',
    [projectId],
  );
  return { ...project, members: members.rows };
}
