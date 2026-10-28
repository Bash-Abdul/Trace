import { invalidatePending } from '../final-approval/final-approval.service.js';
import { validateSchedule, withDeadlines } from '../deadlines/deadlines.service.js';
import {
  resolveObjectives,
  resolveMilestoneCoverage,
} from '../evidence-coverage/coverage.service.js';
import { isFormerAuthor } from '../members/members.repository.js';
import { enqueue } from '../notifications/notifications.repository.js';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../config/db.js';
import { env } from '../../config/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/app-error.js';
import { generateOpaqueToken, hashOpaqueToken } from '../auth/auth-crypto/auth-crypto.js';
import { templates } from './projects.templates.js';
import * as repository from './projects.repository.js';
import type {
  CreateProject,
  SavedStructure,
  Draft,
  Invitation,
  Decision,
  Role,
  MemberProject,
  ProjectListItem,
  ProjectDetailResponse,
  InvitationResponse,
  StructureItem,
  ProjectStatus,
} from './projects.types.js';

// Authentication middleware supplies the transaction used by each mutation.
// Lock the project before checking permissions so concurrent state changes are serialized.
async function requireMemberProjectForUpdate(
  client: PoolClient,
  id: string,
  userId: string,
): Promise<MemberProject> {
  const project = await repository.findMemberProjectForUpdate(client, id, userId);
  if (!project) {
    throw notFound('Project not found');
  }
  return project;
}

function requireRole(project: MemberProject, ...roles: Role[]): void {
  if (!roles.includes(project.role)) {
    throw forbidden('Your project role does not allow this action.');
  }
}

function requireVersion(project: MemberProject, version: number): void {
  if (project.version !== version) {
    throw conflict('This project changed. Reload it before trying again.', 'PROJECT_STALE');
  }
}

function requireDraft(project: MemberProject): void {
  if (!['SETUP', 'PROPOSAL_CHANGES_REQUESTED'].includes(project.status)) {
    throw conflict('The project structure cannot be edited in its current state.');
  }
}

function requireInvitationPermission(project: MemberProject, role: Invitation['role']): void {
  if (['PROPOSAL_REJECTED', 'COMPLETED'].includes(project.status)) {
    throw conflict('This project was rejected.');
  }
  if (
    project.role === 'LEAD_AUTHOR' &&
    (role === 'MAIN_REVIEWER' || (role === 'AUTHOR' && project.project_type === 'GROUP'))
  ) {
    return;
  }
  if (project.role === 'MAIN_REVIEWER' && role === 'LEAD_AUTHOR' && project.status === 'SETUP') {
    return;
  }
  throw forbidden('This invitation role is not allowed for your project.');
}

export async function listProjects(client: Database, userId: string): Promise<ProjectListItem[]> {
  const now = new Date();
  return (await repository.listProjects(client, userId)).map((project) =>
    withDeadlines(project, now),
  );
}

export async function getProject(
  database: Database,
  id: string,
  userId: string,
): Promise<ProjectDetailResponse> {
  // Membership and all detail collections are read in one statement/snapshot, without locks.
  const project = await repository.findProjectDetail(database, id, userId, [
    'LEAD_AUTHOR',
    'MAIN_REVIEWER',
  ]);
  if (!project) {
    throw notFound('Project not found');
  }
  return withDeadlines(project);
}

export async function createProject(
  client: PoolClient,
  userId: string,
  input: CreateProject,
): Promise<ProjectDetailResponse> {
  const template = templates.find((template) => template.key === input.templateKey);
  if (!template && input.templateKey !== 'custom') {
    throw badRequest('Unknown project template', 'VALIDATION_ERROR');
  }
  validateSchedule(input, input.milestones ?? []);
  const id = await repository.insertProject(client, userId, input, template?.version ?? 1);
  await repository.addMember(client, id, userId, input.creatorRole);
  if (
    input.objectiveIds?.some(Boolean) ||
    input.milestones?.some((m) => m.objectiveIds?.length || m.expectedEvidence?.some((r) => r.id))
  )
    throw badRequest(
      'Create the project first, then link its objectives and expected evidence in the brief.',
    );
  const initialStructure: SavedStructure = {
    ...input,
    objectiveIds: input.objectives.map(() => randomUUID()),
    milestones: (
      input.milestones ?? template!.milestones.map((title) => ({ title, required: true }))
    ).map((item) => ({
      ...item,
      id: randomUUID(),
      expectedEvidence: ('expectedEvidence' in item ? (item.expectedEvidence ?? []) : []).map(
        (r) => ({ ...r, id: randomUUID() }),
      ),
    })),
    deliverables: (
      input.deliverables ?? [{ title: 'Final outcome & reflection', required: true }]
    ).map((item) => ({ ...item, id: randomUUID() })),
  };
  await repository.saveStructure(client, id, initialStructure);
  await repository.event(client, id, userId, 'PROJECT_CREATED', {
    projectType: input.projectType,
    approvalRoute: input.approvalRoute,
    template: input.templateKey,
    templateVersion: template?.version ?? 1,
    schedule: {
      dueDate: input.dueDate ?? null,
      timezone: input.timezone ?? null,
      milestones: initialStructure.milestones.map((m) => ({
        id: m.id,
        dueDate: m.dueDate ?? null,
      })),
    },
  });

  return getProject(client, id, userId);
}

export async function updateDraft(
  client: PoolClient,
  id: string,
  userId: string,
  input: Draft,
): Promise<ProjectDetailResponse> {
  const project = await requireMemberProjectForUpdate(client, id, userId);
  requireRole(project, 'LEAD_AUTHOR', 'AUTHOR');
  requireVersion(project, input.version);
  requireDraft(project);

  const before = {
    title: project.title,
    description: project.description,
    dueDate: project.dueDate ?? null,
    timezone: project.timezone ?? null,
    ...(await repository.structure(client, id)),
  };

  const objectiveIds = resolveObjectives(input, before);
  const structure = {
    ...input,
    objectiveIds,
    milestones: resolveMilestoneCoverage(
      resolveItems(input.milestones, before.milestones),
      before,
      objectiveIds,
    ),
    deliverables: resolveItems(input.deliverables, before.deliverables).map(
      ({ id, title, required }) => ({ id, title, required }),
    ),
  };

  validateSchedule(
    {
      dueDate: input.dueDate === undefined ? project.dueDate : input.dueDate,
      timezone: input.timezone === undefined ? project.timezone : input.timezone,
    },
    structure.milestones,
  );
  await repository.updateBrief(client, id, input);
  await repository.saveStructure(client, id, structure);
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'DRAFT_UPDATED', { before, after: input });

  return getProject(client, id, userId);
}

export async function invite(
  client: PoolClient,
  id: string,
  userId: string,
  input: Invitation,
): Promise<InvitationResponse> {
  const project = await requireMemberProjectForUpdate(client, id, userId);
  requireInvitationPermission(project, input.role);
  if (input.role === 'MAIN_REVIEWER' && (await isFormerAuthor(client, id, input.email)))
    throw forbidden('A former Author cannot review their own project.');
  if (await repository.memberByEmail(client, id, input.email)) {
    throw conflict('That person is already a project member.');
  }
  if (input.role !== 'AUTHOR' && (await repository.hasRole(client, id, input.role))) {
    throw conflict('That role is already assigned.');
  }
  await repository.cancelSupersededInvitations(client, id, input.email);
  if (input.role !== 'AUTHOR' && (await repository.hasPendingRole(client, id, input.role))) {
    throw conflict('Cancel the existing invitation for this role first.');
  }

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
): Promise<void> {
  const project = await requireMemberProjectForUpdate(client, id, userId);
  const role = await repository.invitationRole(client, id, invitationId);
  if (!role) {
    throw notFound('Invitation not found');
  }
  requireInvitationPermission(project, role);
  if (!(await repository.cancelInvitation(client, id, invitationId))) {
    throw conflict('This invitation is no longer pending.');
  }
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'INVITATION_CANCELLED', { invitationId });
}

export async function acceptInvitation(
  client: PoolClient,
  userId: string,
  token: string,
): Promise<{ projectId: string }> {
  const hash = hashOpaqueToken(token);
  const id = await repository.invitationProjectId(client, hash);
  if (!id) {
    throw badRequest('This invitation is invalid or no longer available.', 'INVITATION_INVALID');
  }
  const project = await repository.findProjectForUpdate(client, id);
  const invitation = await repository.pendingInvitationForUpdate(client, hash);
  if (!project || !invitation) {
    throw badRequest('This invitation is invalid or no longer available.', 'INVITATION_INVALID');
  }
  const account = await repository.account(client, userId);
  if (!account?.email_verified_at || account.email !== invitation.email) {
    throw forbidden(
      'Sign in with the verified email address this invitation was sent to.',
      'INVITATION_EMAIL_MISMATCH',
    );
  }
  const inviterRole = await repository.memberRole(client, id, invitation.invited_by_user_id);
  if (!inviterRole) {
    throw forbidden('The inviter no longer has access.');
  }
  requireInvitationPermission({ ...project, role: inviterRole }, invitation.role);
  if (invitation.role === 'MAIN_REVIEWER' && (await isFormerAuthor(client, id, account.email)))
    throw forbidden('A former Author cannot review their own project.');
  if (await repository.memberRole(client, id, userId)) {
    throw conflict('You are already a member of this project.');
  }
  if (invitation.role !== 'AUTHOR' && (await repository.hasRole(client, id, invitation.role))) {
    throw conflict('This role is already assigned.');
  }

  await repository.addMember(client, id, userId, invitation.role);
  await repository.consumeInvitation(client, invitation.id);
  await invalidatePending(client, id, userId);
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'INVITATION_ACCEPTED', {
    invitationId: invitation.id,
    role: invitation.role,
  });
  await activateExternalProjectIfReady(client, id, userId);

  return { projectId: id };
}

async function activateExternalProjectIfReady(
  client: PoolClient,
  projectId: string,
  userId: string,
): Promise<void> {
  const hasLeadAuthor = await repository.hasRole(client, projectId, 'LEAD_AUTHOR');
  if (!hasLeadAuthor) {
    return;
  }

  const hasMainReviewer = await repository.hasRole(client, projectId, 'MAIN_REVIEWER');
  if (!hasMainReviewer) {
    return;
  }

  const activated = await repository.activateExternal(client, projectId);
  if (activated) {
    await repository.event(client, projectId, userId, 'PROJECT_ACTIVATED', {
      route: 'EXTERNALLY_APPROVED',
    });
  }
}

export async function submitProposal(
  client: PoolClient,
  id: string,
  userId: string,
  version: number,
): Promise<ProjectDetailResponse> {
  const project = await requireMemberProjectForUpdate(client, id, userId);
  requireRole(project, 'LEAD_AUTHOR');
  requireVersion(project, version);
  requireDraft(project);
  if (project.approval_route !== 'IN_PLATFORM_PROPOSAL') {
    throw conflict('This project uses external approval.');
  }
  if (!(await repository.hasRole(client, id, 'MAIN_REVIEWER'))) {
    throw conflict('Your main Reviewer must join before you submit.');
  }
  await repository.insertProposal(
    client,
    id,
    version,
    {
      title: project.title,
      description: project.description,
      dueDate: project.dueDate ?? null,
      timezone: project.timezone ?? null,
      ...(await repository.structure(client, id)),
    },
    userId,
  );
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'PROPOSAL_SUBMITTED', { version });
  await enqueue(client, id, userId, 'PROPOSAL_SUBMITTED', ['MAIN_REVIEWER'], { version });

  return getProject(client, id, userId);
}

export async function decideProposal(
  client: PoolClient,
  id: string,
  proposalId: string,
  userId: string,
  input: Decision,
): Promise<ProjectDetailResponse> {
  const project = await requireMemberProjectForUpdate(client, id, userId);
  requireRole(project, 'MAIN_REVIEWER');
  requireVersion(project, input.version);
  if (project.status !== 'PROPOSAL_IN_REVIEW') {
    throw conflict('No proposal is awaiting review.');
  }
  const latestProposal = await repository.findLatestProposal(client, id);
  if (latestProposal?.id !== proposalId || latestProposal.decision !== null) {
    throw conflict('This proposal is no longer awaiting a decision.');
  }
  if (!(await repository.recordDecision(client, id, proposalId, userId, input))) {
    throw conflict('This proposal is no longer awaiting a decision.');
  }
  const statuses: Record<Decision['decision'], ProjectStatus> = {
    APPROVE: 'ACTIVE',
    REQUEST_CHANGES: 'PROPOSAL_CHANGES_REQUESTED',
    REJECT: 'PROPOSAL_REJECTED',
  };
  await repository.applyDecisionStatus(client, id, statuses[input.decision]);
  await enqueue(client, id, userId, 'PROPOSAL_DECIDED', ['LEAD_AUTHOR', 'AUTHOR'], {
    proposalId,
    decision: input.decision,
  });
  await repository.touch(client, id);
  await repository.event(client, id, userId, 'PROPOSAL_DECIDED', {
    proposalId,
    decision: input.decision,
    feedback: input.feedback,
  });

  return getProject(client, id, userId);
}

// Explicit IDs are authoritative. An omitted ID alongside explicit IDs means a new item.
function resolveItems(
  input: Draft['milestones'],
  existing: StructureItem[],
): (Draft['milestones'][number] & { id: string })[] {
  const existingIds = new Set(existing.map((item) => item.id));
  const suppliedIds = new Set<string>();
  for (const item of input) {
    if (item.id !== undefined) {
      if (!existingIds.has(item.id) || suppliedIds.has(item.id)) {
        throw badRequest(
          'A structure item is missing, duplicated, or belongs to another project.',
          'INVALID_STRUCTURE_ITEM',
        );
      }
      suppliedIds.add(item.id);
    }
  }
  if (suppliedIds.size === 0) {
    return resolveLegacyItems(input, existing);
  }

  return input.map((item) => ({ ...item, id: item.id ?? randomUUID() }));
}

// Old clients send no IDs. Keep positional renames compatible, but recognize unchanged
// titles before inferring positions so deletion/insertion/reordering cannot shift IDs.
function resolveLegacyItems(
  input: Draft['milestones'],
  existing: StructureItem[],
): (Draft['milestones'][number] & { id: string })[] {
  const sameTitleOrder =
    input.length === existing.length &&
    input.every((item, index) => item.title === existing[index]?.title);
  if (sameTitleOrder) {
    return input.map((item, index) => ({ ...item, id: existing[index]!.id }));
  }

  const ambiguous = () =>
    badRequest(
      'Include item IDs when combining renames with structural changes or editing duplicate titles.',
      'STRUCTURE_IDS_REQUIRED',
    );
  const matches = input.map((item) => {
    const candidates = existing.filter((previous) => previous.title === item.title);
    if (
      candidates.length > 1 ||
      (candidates.length === 1 && input.filter((entry) => entry.title === item.title).length > 1)
    ) {
      throw ambiguous();
    }
    return candidates[0];
  });

  const positionalRename =
    input.length === existing.length &&
    matches.every((match, index) => !match || match.id === existing[index]?.id);
  if (positionalRename) {
    return input.map((item, index) => ({ ...item, id: existing[index]!.id }));
  }

  const retainedIds = new Set(matches.map((item) => item?.id));
  const removedItems = existing.some((item) => !retainedIds.has(item.id));
  const newItems = matches.some((item) => !item);
  if (removedItems && newItems) {
    throw ambiguous();
  }

  return input.map((item, index) => ({ ...item, id: matches[index]?.id ?? randomUUID() }));
}
