import type { PoolClient } from 'pg';
import type {
  Draft,
  CreateProject,
  Invitation,
  Decision,
  Role,
  MemberProject,
  ProjectRecord,
  ProjectMember,
  InvitationRecord,
  PendingInvitation,
  ProposalRecord,
  ProposalSnapshot,
  ProjectEvent,
} from './projects.types.js';

export async function event(
  client: PoolClient,
  id: string,
  userId: string,
  action: string,
  details: unknown = {},
) {
  await client.query(
    'INSERT INTO project_events(project_id, actor_user_id, action, details) VALUES ($1,$2,$3,$4)',
    [id, userId, action, JSON.stringify(details)],
  );
}
export async function touch(client: PoolClient, id: string) {
  await client.query(
    'UPDATE projects SET version = version + 1, updated_at = now() WHERE id = $1',
    [id],
  );
}
export async function structure(client: PoolClient, id: string) {
  const objectives = await client.query<{ title: string }>(
    'SELECT title FROM project_objectives WHERE project_id = $1 ORDER BY position',
    [id],
  );
  const milestones = await client.query<{ id: string; title: string; required: boolean }>(
    'SELECT id, title, required FROM project_milestones WHERE project_id = $1 ORDER BY position',
    [id],
  );
  const deliverables = await client.query<{ id: string; title: string; required: boolean }>(
    'SELECT id, title, required FROM project_deliverables WHERE project_id = $1 ORDER BY position',
    [id],
  );
  return {
    objectives: objectives.rows.map((o) => o.title),
    milestones: milestones.rows,
    deliverables: deliverables.rows,
  };
}
export async function saveStructure(client: PoolClient, id: string, draft: Omit<Draft, 'version'>) {
  await client.query('DELETE FROM project_objectives WHERE project_id = $1', [id]);
  await client.query('DELETE FROM project_milestones WHERE project_id = $1', [id]);
  await client.query('DELETE FROM project_deliverables WHERE project_id = $1', [id]);
  for (const [position, title] of draft.objectives.entries())
    await client.query(
      'INSERT INTO project_objectives(project_id, position, title) VALUES ($1,$2,$3)',
      [id, position, title],
    );
  for (const [position, item] of draft.milestones.entries())
    await client.query(
      'INSERT INTO project_milestones(project_id, position, title, required) VALUES ($1,$2,$3,$4)',
      [id, position, item.title, item.required],
    );
  for (const [position, item] of draft.deliverables.entries())
    await client.query(
      'INSERT INTO project_deliverables(project_id, position, title, required) VALUES ($1,$2,$3,$4)',
      [id, position, item.title, item.required],
    );
}

export async function listProjects(client: PoolClient, userId: string) {
  return (
    await client.query<MemberProject>(
      `SELECT p.*, m.role FROM projects p
    JOIN project_memberships m ON m.project_id = p.id WHERE m.user_id = $1
    ORDER BY p.updated_at DESC LIMIT 100`,
      [userId],
    )
  ).rows;
}

export async function hasRole(client: PoolClient, id: string, role: Role) {
  return Boolean(
    (
      await client.query('SELECT 1 FROM project_memberships WHERE project_id=$1 AND role=$2', [
        id,
        role,
      ])
    ).rowCount,
  );
}

export async function findMemberProjectForUpdate(client: PoolClient, id: string, userId: string) {
  return (
    await client.query<MemberProject>(
      `SELECT p.*, m.role FROM projects p
    JOIN project_memberships m ON m.project_id=p.id WHERE p.id=$1 AND m.user_id=$2 FOR UPDATE OF p`,
      [id, userId],
    )
  ).rows[0];
}
export async function findProjectForUpdate(client: PoolClient, id: string) {
  return (await client.query<ProjectRecord>('SELECT * FROM projects WHERE id=$1 FOR UPDATE', [id]))
    .rows[0];
}
export async function members(client: PoolClient, id: string) {
  return (
    await client.query<ProjectMember>(
      `SELECT m.user_id,u.email,m.role FROM project_memberships m
    JOIN users u ON u.id=m.user_id WHERE m.project_id=$1 ORDER BY m.joined_at,m.user_id`,
      [id],
    )
  ).rows;
}
export async function invitations(client: PoolClient, id: string) {
  return (
    await client.query<InvitationRecord>(
      `SELECT id,email,role,expires_at,consumed_at,cancelled_at
    FROM project_invitations WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [id],
    )
  ).rows;
}
export async function proposals(client: PoolClient, id: string) {
  return (
    await client.query<ProposalRecord>(
      `SELECT id,version,structure,submitted_at,submitted_by_user_id,decision,feedback,decided_at,decided_by_user_id
    FROM project_proposals WHERE project_id=$1 ORDER BY version DESC`,
      [id],
    )
  ).rows;
}
export async function events(client: PoolClient, id: string) {
  return (
    await client.query<ProjectEvent>(
      `SELECT e.id,e.action,e.details,e.created_at,u.email AS actor
    FROM project_events e JOIN users u ON u.id=e.actor_user_id WHERE project_id=$1 ORDER BY e.created_at DESC,e.id LIMIT 100`,
      [id],
    )
  ).rows;
}
export async function insertProject(
  client: PoolClient,
  userId: string,
  input: CreateProject,
  templateVersion: number,
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO projects(created_by_user_id,project_type,approval_route,title,description,template_key,template_version)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      userId,
      input.projectType,
      input.approvalRoute,
      input.title,
      input.description,
      input.templateKey,
      templateVersion,
    ],
  );
  return result.rows[0]!.id;
}
export async function addMember(client: PoolClient, id: string, userId: string, role: Role) {
  await client.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)', [
    id,
    userId,
    role,
  ]);
}
export async function updateBrief(client: PoolClient, id: string, input: Draft) {
  await client.query('UPDATE projects SET title=$2,description=$3 WHERE id=$1', [
    id,
    input.title,
    input.description,
  ]);
}
export async function memberByEmail(client: PoolClient, id: string, email: string) {
  return Boolean(
    (
      await client.query(
        'SELECT 1 FROM project_memberships m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1 AND u.email=$2',
        [id, email],
      )
    ).rowCount,
  );
}
export async function memberRole(client: PoolClient, id: string, userId: string) {
  return (
    await client.query<{ role: Role }>(
      'SELECT role FROM project_memberships WHERE project_id=$1 AND user_id=$2',
      [id, userId],
    )
  ).rows[0]?.role;
}
export async function cancelSupersededInvitations(client: PoolClient, id: string, email: string) {
  await client.query(
    `UPDATE project_invitations SET cancelled_at=now() WHERE project_id=$1 AND consumed_at IS NULL AND cancelled_at IS NULL
    AND (email=$2 OR expires_at<=now())`,
    [id, email],
  );
}
export async function hasPendingRole(client: PoolClient, id: string, role: Invitation['role']) {
  return Boolean(
    (
      await client.query(
        `SELECT 1 FROM project_invitations WHERE project_id=$1 AND role=$2 AND consumed_at IS NULL AND cancelled_at IS NULL`,
        [id, role],
      )
    ).rowCount,
  );
}
export async function insertInvitation(
  client: PoolClient,
  id: string,
  userId: string,
  input: Invitation,
  tokenHash: string,
) {
  return (
    await client.query<{ id: string; expires_at: Date }>(
      `INSERT INTO project_invitations(project_id,invited_by_user_id,email,role,token_hash)
    VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at`,
      [id, userId, input.email, input.role, tokenHash],
    )
  ).rows[0]!;
}
export async function invitationRole(client: PoolClient, id: string, invitationId: string) {
  return (
    await client.query<{ role: Invitation['role'] }>(
      'SELECT role FROM project_invitations WHERE id=$1 AND project_id=$2',
      [invitationId, id],
    )
  ).rows[0]?.role;
}
export async function cancelInvitation(client: PoolClient, id: string, invitationId: string) {
  return Boolean(
    (
      await client.query(
        `UPDATE project_invitations SET cancelled_at=now() WHERE id=$1 AND project_id=$2 AND consumed_at IS NULL AND cancelled_at IS NULL`,
        [invitationId, id],
      )
    ).rowCount,
  );
}
export async function activateExternal(client: PoolClient, id: string) {
  return Boolean(
    (
      await client.query(
        `UPDATE projects SET status='ACTIVE',activated_at=now(),activated_version=version
    WHERE id=$1 AND status='SETUP' AND approval_route='EXTERNALLY_APPROVED' RETURNING id`,
        [id],
      )
    ).rowCount,
  );
}
export async function invitationProjectId(client: PoolClient, tokenHash: string) {
  return (
    await client.query<{ project_id: string }>(
      'SELECT project_id FROM project_invitations WHERE token_hash=$1',
      [tokenHash],
    )
  ).rows[0]?.project_id;
}
export async function pendingInvitationForUpdate(client: PoolClient, tokenHash: string) {
  return (
    await client.query<PendingInvitation>(
      `SELECT id,role,email,invited_by_user_id FROM project_invitations
    WHERE token_hash=$1 AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,
      [tokenHash],
    )
  ).rows[0];
}
export async function account(client: PoolClient, userId: string) {
  return (
    await client.query<{ email: string; email_verified_at: Date | null }>(
      'SELECT email,email_verified_at FROM users WHERE id=$1',
      [userId],
    )
  ).rows[0];
}
export async function consumeInvitation(client: PoolClient, invitationId: string) {
  await client.query('UPDATE project_invitations SET consumed_at=now() WHERE id=$1', [
    invitationId,
  ]);
}
export async function insertProposal(
  client: PoolClient,
  id: string,
  version: number,
  snapshot: ProposalSnapshot,
  userId: string,
) {
  await client.query(
    'INSERT INTO project_proposals(project_id,version,structure,submitted_by_user_id) VALUES($1,$2,$3,$4)',
    [id, version, JSON.stringify(snapshot), userId],
  );
  await client.query("UPDATE projects SET status='PROPOSAL_IN_REVIEW' WHERE id=$1", [id]);
}
export async function recordDecision(
  client: PoolClient,
  id: string,
  proposalId: string,
  userId: string,
  input: Decision,
) {
  return Boolean(
    (
      await client.query(
        `UPDATE project_proposals SET decision=$3,feedback=$4,decided_by_user_id=$5,decided_at=now()
    WHERE id=$1 AND project_id=$2 AND decision IS NULL RETURNING id`,
        [proposalId, id, input.decision, input.feedback, userId],
      )
    ).rowCount,
  );
}
export async function applyDecisionStatus(
  client: PoolClient,
  id: string,
  status: ProjectRecord['status'],
) {
  await client.query(
    `UPDATE projects SET status=$2,activated_at=CASE WHEN $2='ACTIVE' THEN now() ELSE NULL END,
    activated_version=CASE WHEN $2='ACTIVE' THEN version ELSE NULL END WHERE id=$1`,
    [id, status],
  );
}
