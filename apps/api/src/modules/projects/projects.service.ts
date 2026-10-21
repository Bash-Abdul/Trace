import type { PoolClient } from 'pg';
import { env } from '../../config/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/app-error.js';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/auth-crypto/auth-crypto.js';
import { templates } from './projects.schema.js';
import * as repository from './projects.repository.js';
import type {
  CreateProject,
  Draft,
  Invitation,
  Decision,
  Role,
  MemberProject,
  ProjectDetail,
  ProjectStatus,
} from './projects.types.js';

// The controller supplies the authenticated transaction; every operation uses that client.
// Lock the project before checking permissions so concurrent state changes are serialized.
async function projectFor(client: PoolClient, id: string, userId: string) {
  const project = await repository.findMemberProjectForUpdate(client, id, userId);
  if (!project) throw notFound('Project not found');
  return project;
}
function requireRole(project: MemberProject, ...roles: Role[]) {
  if (!roles.includes(project.role))
    throw forbidden('Your project role does not allow this action.');
}
function requireVersion(project: MemberProject, version: number) {
  if (project.version !== version)
    throw conflict('This project changed. Reload it before trying again.', 'PROJECT_STALE');
}
function requireDraft(project: MemberProject) {
  if (!['SETUP', 'PROPOSAL_CHANGES_REQUESTED'].includes(project.status))
    throw conflict('The project structure cannot be edited in its current state.');
}
function mayInvite(project: MemberProject, role: Invitation['role']) {
  if (project.status === 'PROPOSAL_REJECTED') throw conflict('This project was rejected.');
  if (
    project.role === 'LEAD_AUTHOR' &&
    (role === 'MAIN_REVIEWER' || (role === 'AUTHOR' && project.project_type === 'GROUP'))
  )
    return;
  if (project.role === 'MAIN_REVIEWER' && role === 'LEAD_AUTHOR' && project.status === 'SETUP')
    return;
  throw forbidden('This invitation role is not allowed for your project.');
}
export function listProjects(client: PoolClient, userId: string) {
  return repository.listProjects(client, userId);
}
export async function getProject(
  client: PoolClient,
  id: string,
  userId: string,
): Promise<ProjectDetail> {
  const project = await projectFor(client, id, userId);
  return {
    ...project,
    ...(await repository.structure(client, id)),
    members: await repository.members(client, id),
    invitations: ['LEAD_AUTHOR', 'MAIN_REVIEWER'].includes(project.role)
      ? await repository.invitations(client, id)
      : [],
    proposals: await repository.proposals(client, id),
    events: await repository.events(client, id),
  };
}
export async function createProject(client: PoolClient, userId: string, input: CreateProject) {
  const template = templates.find((t) => t.key === input.templateKey)!;
  const id = await repository.insertProject(client, userId, input, template.version);
  await repository.addMember(client, id, userId, input.creatorRole);
  await repository.saveStructure(client, id, {
    ...input,
    milestones: template.milestones.map((title) => ({ title, required: true })),
    deliverables: [{ title: 'Final outcome & reflection', required: true }],
  });
  await repository.event(client, id, userId, 'PROJECT_CREATED', {
    projectType: input.projectType,
    approvalRoute: input.approvalRoute,
    template: template.key,
    templateVersion: template.version,
  });
  return getProject(client, id, userId);
}
export async function updateDraft(client: PoolClient, id: string, userId: string, input: Draft) {
  const project = await projectFor(client, id, userId);
  requireRole(project, 'LEAD_AUTHOR', 'AUTHOR');
  requireVersion(project, input.version);
  requireDraft(project);
  const before = {
    title: project.title,
    description: project.description,
    ...(await repository.structure(client, id)),
  };
  await repository.updateBrief(client, id, input);
  await repository.saveStructure(client, id, input);
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'DRAFT_UPDATED', { before, after: input });
  return getProject(client, id, userId);
}
export async function invite(client: PoolClient, id: string, userId: string, input: Invitation) {
  const project = await projectFor(client, id, userId);
  mayInvite(project, input.role);
  if (await repository.memberByEmail(client, id, input.email))
    throw conflict('That person is already a project member.');
  if (input.role !== 'AUTHOR' && (await repository.hasRole(client, id, input.role)))
    throw conflict('That role is already assigned.');
  await repository.cancelSupersededInvitations(client, id, input.email);
  if (input.role !== 'AUTHOR' && (await repository.hasPendingRole(client, id, input.role)))
    throw conflict('Cancel the existing invitation for this role first.');
  const token = generateOpaqueToken();
  const invitation = await repository.insertInvitation(
    client,
    id,
    userId,
    input,
    hashOpaqueToken(token),
  );
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'INVITATION_CREATED', {
    invitationId: invitation.id,
    role: input.role,
  });
  return { ...invitation, invitationUrl: `${env.APP_ORIGIN}/invitations/accept#token=${token}` };
}
export async function cancelInvitation(
  client: PoolClient,
  id: string,
  invitationId: string,
  userId: string,
) {
  const project = await projectFor(client, id, userId);
  const role = await repository.invitationRole(client, id, invitationId);
  if (!role) throw notFound('Invitation not found');
  mayInvite(project, role);
  if (!(await repository.cancelInvitation(client, id, invitationId)))
    throw conflict('This invitation is no longer pending.');
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'INVITATION_CANCELLED', { invitationId });
}
export async function acceptInvitation(client: PoolClient, userId: string, token: string) {
  const hash = hashOpaqueToken(token);
  const id = await repository.invitationProjectId(client, hash);
  if (!id)
    throw badRequest('This invitation is invalid or no longer available.', 'INVITATION_INVALID');
  const project = await repository.findProjectForUpdate(client, id);
  const invitation = await repository.pendingInvitationForUpdate(client, hash);
  if (!project || !invitation)
    throw badRequest('This invitation is invalid or no longer available.', 'INVITATION_INVALID');
  const account = await repository.account(client, userId);
  if (!account?.email_verified_at || account.email !== invitation.email)
    throw forbidden(
      'Sign in with the verified email address this invitation was sent to.',
      'INVITATION_EMAIL_MISMATCH',
    );
  const inviterRole = await repository.memberRole(client, id, invitation.invited_by_user_id);
  if (!inviterRole) throw forbidden('The inviter no longer has access.');
  mayInvite({ ...project, role: inviterRole }, invitation.role);
  if (await repository.memberRole(client, id, userId))
    throw conflict('You are already a member of this project.');
  if (invitation.role !== 'AUTHOR' && (await repository.hasRole(client, id, invitation.role)))
    throw conflict('This role is already assigned.');
  await repository.addMember(client, id, userId, invitation.role);
  await repository.consumeInvitation(client, invitation.id);
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'INVITATION_ACCEPTED', {
    invitationId: invitation.id,
    role: invitation.role,
  });
  if (
    (await repository.hasRole(client, id, 'LEAD_AUTHOR')) &&
    (await repository.hasRole(client, id, 'MAIN_REVIEWER')) &&
    (await repository.activateExternal(client, id))
  ) {
    await repository.event(client, id, userId, 'PROJECT_ACTIVATED', {
      route: 'EXTERNALLY_APPROVED',
    });
  }
  return { projectId: id };
}
export async function submitProposal(
  client: PoolClient,
  id: string,
  userId: string,
  version: number,
) {
  const project = await projectFor(client, id, userId);
  requireRole(project, 'LEAD_AUTHOR');
  requireVersion(project, version);
  requireDraft(project);
  if (project.approval_route !== 'IN_PLATFORM_PROPOSAL')
    throw conflict('This project uses external approval.');
  if (!(await repository.hasRole(client, id, 'MAIN_REVIEWER')))
    throw conflict('Your main Reviewer must join before you submit.');
  await repository.insertProposal(
    client,
    id,
    version,
    {
      title: project.title,
      description: project.description,
      ...(await repository.structure(client, id)),
    },
    userId,
  );
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'PROPOSAL_SUBMITTED', { version });
  return getProject(client, id, userId);
}
export async function decideProposal(
  client: PoolClient,
  id: string,
  proposalId: string,
  userId: string,
  input: Decision,
) {
  const project = await projectFor(client, id, userId);
  requireRole(project, 'MAIN_REVIEWER');
  requireVersion(project, input.version);
  if (project.status !== 'PROPOSAL_IN_REVIEW') throw conflict('No proposal is awaiting review.');
  if (!(await repository.recordDecision(client, id, proposalId, userId, input)))
    throw conflict('This proposal is no longer awaiting a decision.');
  const statuses: Record<Decision['decision'], ProjectStatus> = {
    APPROVE: 'ACTIVE',
    REQUEST_CHANGES: 'PROPOSAL_CHANGES_REQUESTED',
    REJECT: 'PROPOSAL_REJECTED',
  };
  await repository.applyDecisionStatus(client, id, statuses[input.decision]);
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'PROPOSAL_DECIDED', {
    proposalId,
    decision: input.decision,
    feedback: input.feedback,
  });
  return getProject(client, id, userId);
}
