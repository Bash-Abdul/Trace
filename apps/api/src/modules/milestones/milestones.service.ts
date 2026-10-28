import { invalidatePending } from '../final-approval/final-approval.service.js';
import { deadline } from '../deadlines/deadlines.service.js';
import { snapshot as snapshotCoverage } from '../evidence-coverage/coverage.repository.js';
import { isDeepStrictEqual } from 'node:util';
import { enqueue } from '../notifications/notifications.repository.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction, type Database } from '../../config/db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../utils/app-error.js';
import * as projects from '../projects/projects.repository.js';
import type { MemberProject, Role } from '../projects/projects.types.js';
import * as repository from './milestones.repository.js';
import type {
  Decision,
  Detail,
  Draft,
  FeedbackUpdate,
  MilestoneParams,
  NewFeedback,
  State,
} from './milestones.types.js';

async function member(
  client: PoolClient,
  projectId: string,
  userId: string,
): Promise<MemberProject> {
  const project = await projects.findMemberProjectForUpdate(client, projectId, userId);
  if (!project) {
    throw notFound('Project not found');
  }
  if (!['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status)) {
    throw new AppError(
      422,
      'PROJECT_INACTIVE',
      'Activate the project before working on milestones.',
    );
  }
  return project;
}

function requireRole(project: MemberProject, roles: Role[]): void {
  if (!roles.includes(project.role)) {
    throw forbidden('Your project role does not allow this action.');
  }
}

async function context(
  client: PoolClient,
  params: MilestoneParams,
  userId: string,
): Promise<{
  project: MemberProject;
  milestone: Detail['milestone'];
  version: number;
  state: State;
}> {
  const project = await member(client, params.projectId, userId);
  const milestone = await repository.milestone(client, params.projectId, params.milestoneId);
  if (!milestone) {
    throw notFound('Milestone not found');
  }
  return { project, milestone, ...(await repository.state(client, params.milestoneId)) };
}

function requireVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw conflict('This milestone changed. Reload it before trying again.', 'MILESTONE_STALE');
  }
}

async function detail(client: PoolClient, params: MilestoneParams): Promise<Detail> {
  const milestone = await repository.milestone(client, params.projectId, params.milestoneId);
  if (!milestone) {
    throw notFound('Milestone not found');
  }
  const current = await repository.state(client, params.milestoneId);
  return {
    milestone,
    ...current,
    deadline: deadline(milestone.dueDate, milestone.timezone, current.state),
    evidence: await repository.evidence(client, params.milestoneId),
    submissions: await repository.versions(client, params.milestoneId),
    feedback: await repository.feedback(client, params.milestoneId),
    messages: await repository.messages(client, params.milestoneId),
  };
}

export async function read(params: MilestoneParams, userId: string): Promise<Detail> {
  return withTransaction(async (client) => {
    // Multiple simple reads share one snapshot without locking projects or accounts.
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const membership = await projects.memberRole(client, params.projectId, userId);
    if (!membership) {
      throw notFound('Project not found');
    }
    return detail(client, params);
  });
}

async function record(
  client: PoolClient,
  params: MilestoneParams,
  userId: string,
  action: string,
  roles: Role[],
  details: object = {},
): Promise<void> {
  await invalidatePending(client, params.projectId, userId);
  await projects.event(client, params.projectId, userId, action, {
    milestoneId: params.milestoneId,
    ...details,
  });
  if (roles.length) {
    await enqueue(client, params.projectId, userId, action, roles, details, params.milestoneId);
  }
}

async function transition(
  client: PoolClient,
  params: MilestoneParams,
  version: number,
  next: State,
): Promise<void> {
  if (!(await repository.transition(client, params.milestoneId, version, next))) {
    throw conflict('This milestone changed.', 'MILESTONE_STALE');
  }
}

export async function saveDraft(
  client: PoolClient,
  params: MilestoneParams,
  userId: string,
  input: Draft,
): Promise<Detail> {
  const current = await context(client, params, userId);
  if (current.milestone.archived_at)
    throw conflict(
      'This milestone was removed from the active plan. Its history remains available.',
    );
  requireRole(current.project, ['LEAD_AUTHOR', 'AUTHOR']);
  requireVersion(current.version, input.version);
  if (!['NOT_STARTED', 'DRAFT', 'REVISION_REQUESTED'].includes(current.state)) {
    throw conflict('This milestone is not editable.');
  }
  const existing = await repository.evidence(client, params.milestoneId);
  const structure = await projects.structure(client, params.projectId);
  const plan = structure.milestones.find((m) => m.id === params.milestoneId)!;
  const used = new Set<string>();
  const evidence = input.evidence.map((item) => {
    const previous = existing.find((entry) => entry.id === item.id);
    if (item.id && (!previous || used.has(item.id))) {
      throw badRequest('Evidence IDs must belong to this draft and appear only once.');
    }
    const id = item.id ?? randomUUID();
    const objectiveIds = item.objectiveIds ?? previous?.objectiveIds ?? [];
    const expectationIds = item.expectationIds ?? previous?.expectationIds ?? [];
    if (
      new Set(objectiveIds).size !== objectiveIds.length ||
      objectiveIds.some((id) => !plan.objectiveIds?.includes(id)) ||
      new Set(expectationIds).size !== expectationIds.length ||
      expectationIds.some((id) => !plan.expectedEvidence?.some((r) => r.id === id))
    )
      throw badRequest('Evidence mappings must belong to this milestone and appear only once.');
    used.add(id);
    const unchanged =
      previous &&
      previous.title === item.title &&
      previous.kind === item.kind &&
      previous.content === item.content &&
      isDeepStrictEqual(previous.objectiveIds, objectiveIds) &&
      isDeepStrictEqual(previous.expectationIds, expectationIds);
    return {
      ...item,
      objectiveIds,
      expectationIds,
      id,
      created_by: previous?.created_by ?? userId,
      updated_by: unchanged ? previous.updated_by : userId,
    };
  });
  await repository.saveDraft(client, params.milestoneId, evidence);
  await transition(client, params, current.version, 'DRAFT');
  await record(client, params, userId, 'MILESTONE_DRAFT_SAVED', []);
  return detail(client, params);
}

export async function submit(
  client: PoolClient,
  params: MilestoneParams,
  userId: string,
  version: number,
): Promise<Detail> {
  const current = await context(client, params, userId);
  if (current.milestone.archived_at)
    throw conflict(
      'This milestone was removed from the active plan. Its history remains available.',
    );
  requireRole(current.project, ['LEAD_AUTHOR']);
  requireVersion(current.version, version);
  if (current.state !== 'DRAFT') {
    throw conflict('Save a draft before submitting.');
  }
  if (!(await projects.hasRole(client, params.projectId, 'MAIN_REVIEWER'))) {
    throw new AppError(422, 'REVIEWER_REQUIRED', 'Your main Reviewer must join first.');
  }
  const evidence = await repository.evidence(client, params.milestoneId);
  if (!evidence.length) {
    throw new AppError(422, 'EVIDENCE_REQUIRED', 'Add evidence before submitting.');
  }
  const structure = await projects.structure(client, params.projectId);
  const plan = structure.milestones.find((m) => m.id === params.milestoneId)!;
  const snapshot = evidence.map((item) => ({
    ...item,
    objectiveMappings: (item.objectiveIds ?? []).map((id) => ({
      id,
      title: structure.objectives[structure.objectiveIds!.indexOf(id)]!,
    })),
    expectationMappings: (plan.expectedEvidence ?? []).filter((r) =>
      item.expectationIds?.includes(r.id),
    ),
  }));
  const submissionId = await repository.submit(client, params.milestoneId, snapshot, userId);
  await snapshotCoverage(client, submissionId, {
    dueDate: plan.dueDate ?? null,
    timezone: current.project.timezone ?? null,
    objectives: (plan.objectiveIds ?? []).map((id) => ({
      id,
      title: structure.objectives[structure.objectiveIds!.indexOf(id)]!,
    })),
    expectedEvidence: plan.expectedEvidence ?? [],
  });
  await transition(client, params, version, 'AWAITING_REVIEW');
  await record(client, params, userId, 'MILESTONE_SUBMITTED', ['MAIN_REVIEWER'], { submissionId });
  return detail(client, params);
}

export async function decide(
  client: PoolClient,
  params: MilestoneParams,
  submissionId: string,
  userId: string,
  input: Decision,
): Promise<Detail> {
  const current = await context(client, params, userId);
  if (current.milestone.archived_at)
    throw conflict(
      'This milestone was removed from the active plan. Its history remains available.',
    );
  requireRole(current.project, ['MAIN_REVIEWER']);
  requireVersion(current.version, input.version);
  const latest = (await repository.versions(client, params.milestoneId))[0];
  if (
    current.state !== 'AWAITING_REVIEW' ||
    latest?.id !== submissionId ||
    latest.decision !== null
  ) {
    throw conflict('This submission is no longer awaiting review.');
  }
  if (!(await repository.decide(client, params.milestoneId, submissionId, userId, input))) {
    throw conflict('This submission has already been reviewed.');
  }
  await transition(
    client,
    params,
    input.version,
    input.decision === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUESTED',
  );
  await record(client, params, userId, 'MILESTONE_REVIEWED', ['LEAD_AUTHOR', 'AUTHOR'], {
    submissionId,
    decision: input.decision,
  });
  return detail(client, params);
}

export async function addFeedback(
  client: PoolClient,
  params: MilestoneParams,
  submissionId: string,
  userId: string,
  input: NewFeedback,
): Promise<Detail> {
  const current = await context(client, params, userId);
  if (current.milestone.archived_at)
    throw conflict('This milestone is archived. Existing threads can still be resolved.');
  requireRole(current.project, ['MAIN_REVIEWER']);
  const submission = (await repository.versions(client, params.milestoneId)).find(
    (item) => item.id === submissionId,
  );
  if (!submission) {
    throw notFound('Submission not found');
  }
  const feedbackId = await repository.addFeedback(client, submissionId, userId, input);
  await record(client, params, userId, 'MILESTONE_FEEDBACK_CREATED', ['LEAD_AUTHOR', 'AUTHOR'], {
    feedbackId,
  });
  return detail(client, params);
}

export async function updateFeedback(
  client: PoolClient,
  params: MilestoneParams,
  feedbackId: string,
  userId: string,
  input: FeedbackUpdate,
): Promise<Detail> {
  const current = await context(client, params, userId);
  const feedback = (await repository.feedback(client, params.milestoneId)).find(
    (item) => item.id === feedbackId,
  );
  if (!feedback) {
    throw notFound('Feedback not found');
  }
  requireVersion(feedback.version, input.version);
  const author = ['LEAD_AUTHOR', 'AUTHOR'].includes(current.project.role);
  const allowedRoles: Record<FeedbackUpdate['action'], Role[]> = {
    ADDRESS: ['LEAD_AUTHOR', 'AUTHOR'],
    RESPOND: ['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER'],
    RESOLVE: ['MAIN_REVIEWER'],
    REOPEN: ['MAIN_REVIEWER'],
  };
  requireRole(current.project, allowedRoles[input.action]);
  let state = feedback.state;
  if (input.action === 'ADDRESS') {
    if (state !== 'OPEN') {
      throw conflict('Only open feedback can be marked addressed.');
    }
    state = 'ADDRESSED_BY_AUTHOR';
  } else if (input.action === 'RESOLVE') {
    if (state === 'RESOLVED_BY_REVIEWER') {
      throw conflict('Feedback is already resolved.');
    }
    state = 'RESOLVED_BY_REVIEWER';
  } else if (input.action === 'REOPEN') {
    if (state === 'OPEN') {
      throw conflict('Feedback is already open.');
    }
    state = 'OPEN';
  } else if (state === 'RESOLVED_BY_REVIEWER') {
    throw conflict('Reopen feedback before responding.');
  }
  if (
    !(await repository.updateFeedback(client, feedbackId, input.version, state, userId, input.body))
  ) {
    throw conflict('This feedback changed.');
  }
  await record(
    client,
    params,
    userId,
    'MILESTONE_FEEDBACK_UPDATED',
    author ? ['MAIN_REVIEWER'] : ['LEAD_AUTHOR', 'AUTHOR'],
    { feedbackId, action: input.action },
  );
  return detail(client, params);
}

export async function notifications(
  client: Database,
  projectId: string,
  userId: string,
): Promise<Awaited<ReturnType<typeof repository.notifications>>> {
  const role = await projects.memberRole(client, projectId, userId);
  if (!role) {
    throw notFound('Project not found');
  }
  if (role === 'DORMANT_REVIEWER') {
    return [];
  }
  return repository.notifications(client, projectId, userId);
}
