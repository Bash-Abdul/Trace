import type { PoolClient } from 'pg';
import { badRequest, conflict, forbidden, notFound } from '../../utils/app-error.js';
import { env } from '../../config/index.js';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/auth-crypto/auth-crypto.js';
import {
  type Invitation,
  type Project,
  projectDetail,
  recordProjectEvent,
  requireProject,
} from './projects.repository.js';
import type { CreateProjectInput, ProjectRole } from './projects.schema.js';

function requireInvitePermission(actorRole: ProjectRole, invitedRole: ProjectRole): void {
  const allowed =
    actorRole === 'MAIN_REVIEWER'
      ? invitedRole === 'AUTHOR' || invitedRole === 'DORMANT_REVIEWER'
      : actorRole === 'AUTHOR' && invitedRole === 'MAIN_REVIEWER';
  if (!allowed)
    throw forbidden('This project role cannot issue that invitation', 'PROJECT_ROLE_DENIED');
}

export async function issueInvitation(
  client: PoolClient,
  projectId: string,
  actorId: string,
  input: { email: string; role: ProjectRole },
) {
  const project = await requireProject(client, projectId, actorId);
  requireInvitePermission(project.role, input.role);
  const occupied = await client.query(
    `SELECT user_id FROM project_memberships
    WHERE project_id = $1 AND role = $2 AND role <> 'DORMANT_REVIEWER'`,
    [projectId, input.role],
  );
  if (occupied.rowCount) throw conflict('This role is already assigned', 'ROLE_FILLED');
  const member = await client.query(
    `SELECT m.user_id FROM project_memberships m JOIN users u ON u.id = m.user_id
    WHERE m.project_id = $1 AND u.email = $2`,
    [projectId, input.email],
  );
  if (member.rowCount) throw conflict('The invited account is already a member', 'ALREADY_MEMBER');
  const other = await client.query(
    `SELECT id FROM project_invitations WHERE project_id = $1
    AND email = $2 AND role <> $3 AND accepted_at IS NULL AND cancelled_at IS NULL`,
    [projectId, input.email, input.role],
  );
  if (other.rowCount)
    throw conflict('An invitation for another role already exists', 'INVITATION_CONFLICT');
  // Reissue in one transaction: no interval with two live role invitations.
  await client.query(
    `UPDATE project_invitations SET cancelled_at = now() WHERE project_id = $1
    AND role = $2 AND ($2 <> 'DORMANT_REVIEWER' OR email = $3)
    AND accepted_at IS NULL AND cancelled_at IS NULL`,
    [projectId, input.role, input.email],
  );
  const token = generateOpaqueToken();
  const result = await client.query<Invitation>(
    `INSERT INTO project_invitations
    (project_id, email, role, token_hash, invited_by_user_id, expires_at)
    VALUES ($1, $2, $3, $4, $5, now() + $6 * interval '1 second')
    RETURNING id, project_id, email, role, expires_at, accepted_at, accepted_by_user_id, cancelled_at`,
    [
      projectId,
      input.email,
      input.role,
      hashOpaqueToken(token),
      actorId,
      env.INVITATION_TTL_SECONDS,
    ],
  );
  await client.query('UPDATE projects SET version = version + 1 WHERE id = $1', [projectId]);
  await recordProjectEvent(client, projectId, actorId, 'INVITATION_ISSUED');
  // The token is returned only on creation/reissue, never from detail/list routes.
  return { ...result.rows[0]!, token };
}

export async function createProject(
  client: PoolClient,
  actorId: string,
  input: CreateProjectInput,
) {
  const actor = await client.query<{ email: string; email_verified_at: Date | null }>(
    'SELECT email, email_verified_at FROM users WHERE id = $1',
    [actorId],
  );
  if (!actor.rows[0]?.email_verified_at) throw forbidden('Verified email required');
  if (input.inviteEmail === actor.rows[0].email)
    throw badRequest('Invite another account', 'SELF_INVITATION');
  const result = await client.query<Project>(
    `INSERT INTO projects (title, created_by_user_id, author_user_id, approval_route)
    VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.title, actorId, input.creatorRole === 'AUTHOR' ? actorId : null, input.approvalRoute],
  );
  const project = result.rows[0]!;
  await client.query(
    'INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)',
    [project.id, actorId, input.creatorRole],
  );
  await recordProjectEvent(client, project.id, actorId, 'PROJECT_CREATED');
  const invitation = input.inviteEmail
    ? await issueInvitation(client, project.id, actorId, {
        email: input.inviteEmail,
        role: input.creatorRole === 'AUTHOR' ? 'MAIN_REVIEWER' : 'AUTHOR',
      })
    : null;
  return { project: await projectDetail(client, project.id, actorId), invitation };
}

export async function manageInvitation(
  client: PoolClient,
  projectId: string,
  actorId: string,
  invitationId: string,
  resend: boolean,
) {
  const project = await requireProject(client, projectId, actorId);
  const result = await client.query<Invitation>(
    `SELECT id, project_id, email, role, expires_at,
    accepted_at, accepted_by_user_id, cancelled_at FROM project_invitations WHERE project_id = $1 AND id = $2`,
    [projectId, invitationId],
  );
  const invitation = result.rows[0];
  if (!invitation) throw notFound('Invitation not found');
  requireInvitePermission(project.role, invitation.role);
  if (invitation.accepted_at || invitation.cancelled_at)
    throw conflict('Invitation is no longer pending', 'INVITATION_CLOSED');
  if (resend) return issueInvitation(client, projectId, actorId, invitation);
  // A pending Author slot cannot be removed; replace its invitation instead.
  if (invitation.role === 'AUTHOR' && project.author_user_id === null) {
    throw conflict(
      'Replace the Author invitation instead of cancelling it',
      'AUTHOR_INVITATION_REQUIRED',
    );
  }
  await client.query('UPDATE project_invitations SET cancelled_at = now() WHERE id = $1', [
    invitationId,
  ]);
  await client.query('UPDATE projects SET version = version + 1 WHERE id = $1', [projectId]);
  await recordProjectEvent(client, projectId, actorId, 'INVITATION_CANCELLED');
  return null;
}

export async function acceptInvitation(
  client: PoolClient,
  actorId: string,
  token: string,
  key: string,
) {
  const tokenHash = hashOpaqueToken(token);
  const keyHash = hashOpaqueToken(key);
  // withSession holds the account lock, so same-account retries serialize here.
  const previous = await client.query<{ request_hash: string; project_id: string }>(
    'SELECT request_hash, project_id FROM project_idempotency WHERE user_id = $1 AND key_hash = $2',
    [actorId, keyHash],
  );
  if (previous.rows[0]) {
    if (previous.rows[0].request_hash !== tokenHash)
      throw conflict('Idempotency key was used for another invitation', 'IDEMPOTENCY_CONFLICT');
    await requireProject(client, previous.rows[0].project_id, actorId);
    return { projectId: previous.rows[0].project_id };
  }
  const lookup = await client.query<{ project_id: string }>(
    'SELECT project_id FROM project_invitations WHERE token_hash = $1',
    [tokenHash],
  );
  if (!lookup.rows[0]) throw notFound('Invitation unavailable', 'INVITATION_UNAVAILABLE');
  const projectId = lookup.rows[0].project_id;
  await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
  const result = await client.query<Invitation>(
    `SELECT i.id, i.project_id, i.email, i.role, i.expires_at,
    i.accepted_at, i.accepted_by_user_id, i.cancelled_at FROM project_invitations i
    JOIN users u ON u.id = $2 AND u.email = i.email AND u.email_verified_at IS NOT NULL
    WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > clock_timestamp()
    FOR UPDATE OF i`,
    [tokenHash, actorId],
  );
  const invitation = result.rows[0];
  // Wrong account, expired, cancelled, and replayed tokens reveal no project data.
  if (!invitation) throw notFound('Invitation unavailable', 'INVITATION_UNAVAILABLE');
  const existing = await client.query(
    `SELECT user_id FROM project_memberships WHERE project_id = $1
    AND (user_id = $2 OR (role = $3 AND role <> 'DORMANT_REVIEWER'))`,
    [projectId, actorId, invitation.role],
  );
  if (existing.rowCount) throw conflict('Project role is no longer available', 'ROLE_FILLED');
  await client.query(
    'INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)',
    [projectId, actorId, invitation.role],
  );
  await client.query(
    `UPDATE projects SET author_user_id = CASE WHEN $2 = 'AUTHOR' THEN $3 ELSE author_user_id END,
    version = version + 1 WHERE id = $1`,
    [projectId, invitation.role, actorId],
  );
  await client.query(
    'UPDATE project_invitations SET accepted_at = now(), accepted_by_user_id = $2 WHERE id = $1',
    [invitation.id, actorId],
  );
  await client.query(
    'INSERT INTO project_idempotency (user_id, key_hash, request_hash, project_id) VALUES ($1, $2, $3, $4)',
    [actorId, keyHash, tokenHash, projectId],
  );
  await recordProjectEvent(client, projectId, actorId, 'INVITATION_ACCEPTED');
  return { projectId };
}
