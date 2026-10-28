import { records as portfolioRecords } from '../portfolio/portfolio.repository.js';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import { withTransaction, type Database } from '../../config/db.js';
import { AppError, conflict, forbidden, notFound } from '../../utils/app-error.js';
import * as projects from '../projects/projects.repository.js';
import { projectCoverage } from '../evidence-coverage/coverage.service.js';
import { enqueue } from '../notifications/notifications.repository.js';
import * as repository from './final-approval.repository.js';
import type {
  Check,
  Snapshot,
  Detail,
  RequestInput,
  DecisionInput,
} from './final-approval.types.js';

export async function inspectReadiness(db: Database, projectId: string, userId: string) {
  const project = await projects.findProjectDetail(db, projectId, userId, []);
  if (!project) throw notFound('Project not found');
  const approvals = await repository.approvals(db, projectId);
  const coverage = await projectCoverage(db, projectId, project);
  const pendingChanges = await repository.pendingChanges(db, projectId);
  const reviewerId = project.members.find((m) => m.role === 'MAIN_REVIEWER')?.user_id ?? null;
  const check = (key: string, label: string, outstanding: string[]): Check => ({
    key,
    label,
    outstanding,
    satisfied: outstanding.length === 0,
  });
  const checklist = [
    check(
      'milestones',
      'All required milestones approved',
      project.milestones
        .filter((m) => m.required && !approvals.some((a) => a.milestoneId === m.id))
        .map((m) => m.title),
    ),
    check(
      'deliverables',
      'Required deliverables submitted',
      project.deliverables
        .filter(
          (d) =>
            d.required &&
            !project.progress.deliverables.some((v) => v.id === d.id && v.currentSubmissionId),
        )
        .map((d) => d.title),
    ),
    check(
      'feedback',
      'Blocking feedback resolved',
      project.progress.blocking_feedback
        ? [`${project.progress.blocking_feedback} unresolved blocking thread(s)`]
        : [],
    ),
    check(
      'evidence',
      'Required evidence included',
      coverage.requiredOmissions.map((r) => r.title),
    ),
    check(
      'changes',
      'No project changes awaiting review',
      pendingChanges ? ['Review or withdraw the pending project change.'] : [],
    ),
    check('reviewer', 'Main Reviewer has joined', reviewerId ? [] : ['Invite a main Reviewer.']),
  ];
  const {
    title,
    description,
    objectives,
    objectiveIds,
    milestones,
    deliverables,
    dueDate,
    timezone,
    template_key,
    template_version,
  } = project;
  const snapshot: Snapshot = {
    plan: {
      title,
      description,
      objectives,
      ...(objectiveIds ? { objectiveIds } : {}),
      milestones,
      deliverables,
      dueDate,
      timezone,
      template_key,
      template_version,
    },
    milestoneApprovals: approvals,
    deliverableVersions: project.progress.deliverables.flatMap((d) =>
      d.currentSubmissionId ? [{ deliverableId: d.id, submissionId: d.currentSubmissionId }] : [],
    ),
    reviewerId,
    checklist,
  };
  return { project, snapshot };
}
async function detail(db: Database, projectId: string, userId: string): Promise<Detail> {
  const { project, snapshot } = await inspectReadiness(db, projectId, userId);
  return {
    version: project.version,
    status: project.status,
    eligible: project.status === 'ACTIVE' && snapshot.checklist.every((c) => c.satisfied),
    checklist: snapshot.checklist,
    requests: await repository.requests(db, projectId),
  };
}
export async function read(projectId: string, userId: string): Promise<Detail> {
  return withTransaction(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    return detail(db, projectId, userId);
  });
}
async function context(db: PoolClient, projectId: string, userId: string, role: string) {
  const project = await projects.findMemberProjectForUpdate(db, projectId, userId);
  if (!project) throw notFound('Project not found');
  if (project.role !== role)
    throw forbidden('Your project role does not allow this final approval action.');
  return project;
}
async function record(
  db: PoolClient,
  projectId: string,
  userId: string,
  action: string,
  requestId: string,
) {
  await projects.event(db, projectId, userId, action, { requestId });
  await enqueue(db, projectId, userId, action, ['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER'], {
    requestId,
  });
}
// Called only after an authorised material mutation while holding the shared project lock.
export async function invalidatePending(db: PoolClient, projectId: string, userId: string) {
  const id = await repository.invalidate(db, projectId, userId);
  if (!id) return;
  if (!(await repository.setStatus(db, projectId, 'FINAL_APPROVAL_PENDING', 'ACTIVE')))
    throw conflict('Final approval state changed.');
  await record(db, projectId, userId, 'FINAL_APPROVAL_INVALIDATED', id);
}
export async function requestApproval(
  db: PoolClient,
  projectId: string,
  userId: string,
  input: RequestInput,
): Promise<Detail> {
  const project = await context(db, projectId, userId, 'LEAD_AUTHOR');
  const previous = (await repository.requests(db, projectId)).find(
    (r) => r.request_key === input.key,
  );
  if (previous) {
    if (previous.requested_by !== userId || previous.base_version !== input.version)
      throw conflict('This retry key was already used for another request.');
    return detail(db, projectId, userId);
  }
  if (project.status !== 'ACTIVE' || project.version !== input.version)
    throw conflict('The project changed. Reload the checklist before requesting approval.');
  const { snapshot } = await inspectReadiness(db, projectId, userId);
  if (snapshot.checklist.some((c) => !c.satisfied))
    throw new AppError(
      422,
      'FINAL_APPROVAL_INELIGIBLE',
      'Complete the outstanding checklist items first.',
      snapshot.checklist,
    );
  const request = await repository.insert(db, projectId, userId, input, snapshot);
  if (!(await repository.setStatus(db, projectId, 'ACTIVE', 'FINAL_APPROVAL_PENDING')))
    throw conflict('The project changed.');
  await record(db, projectId, userId, 'FINAL_APPROVAL_REQUESTED', request.id);
  return detail(db, projectId, userId);
}
export async function decide(
  db: PoolClient,
  projectId: string,
  requestId: string,
  userId: string,
  input: DecisionInput,
): Promise<Detail> {
  const project = await context(db, projectId, userId, 'MAIN_REVIEWER');
  const requests = await repository.requests(db, projectId);
  const request = requests.find((r) => r.id === requestId);
  if (!request) throw notFound('Final request not found');
  const next = input.decision === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUESTED';
  const replay = requests.find((r) => r.decision_key === input.key);
  if (replay) {
    if (
      replay.id !== requestId ||
      replay.decided_by !== userId ||
      replay.state !== next ||
      replay.feedback !== input.feedback
    )
      throw conflict('This retry key was already used for another decision.');
    return detail(db, projectId, userId);
  }
  if (project.status !== 'FINAL_APPROVAL_PENDING' || request.state !== 'PENDING')
    throw conflict('This final request is no longer pending.');
  const { snapshot } = await inspectReadiness(db, projectId, userId);
  if (!isDeepStrictEqual(snapshot, request.snapshot)) {
    // Persist invalidation rather than throwing and rolling it back.
    await invalidatePending(db, projectId, userId);
    return detail(db, projectId, userId);
  }
  if (!(await repository.close(db, requestId, userId, next, input.feedback, input.key)))
    throw conflict('This final request was already decided.');
  const status = input.decision === 'APPROVE' ? 'COMPLETED' : 'ACTIVE';
  if (!(await repository.setStatus(db, projectId, 'FINAL_APPROVAL_PENDING', status)))
    throw conflict('The project changed.');
  await record(
    db,
    projectId,
    userId,
    input.decision === 'APPROVE' ? 'PROJECT_COMPLETED' : 'FINAL_REVISION_REQUESTED',
    requestId,
  );
  if (input.decision === 'APPROVE') {
    await repository.savePortfolio(db, projectId, requestId, {
      schemaVersion: 2,
      records: await portfolioRecords(db, projectId),
      finalRequest: (await repository.requests(db, projectId)).find((r) => r.id === requestId),
      project: await projects.findProjectDetail(db, projectId, userId, []),
      history: await repository.historyIds(db, projectId),
    });
  }
  return detail(db, projectId, userId);
}
export async function withdraw(
  db: PoolClient,
  projectId: string,
  requestId: string,
  userId: string,
): Promise<Detail> {
  const project = await context(db, projectId, userId, 'LEAD_AUTHOR');
  const request = (await repository.requests(db, projectId)).find((r) => r.id === requestId);
  if (!request) throw notFound('Final request not found');
  if (request.state === 'WITHDRAWN' && request.decided_by === userId)
    return detail(db, projectId, userId);
  if (
    project.status !== 'FINAL_APPROVAL_PENDING' ||
    !(await repository.close(db, requestId, userId, 'WITHDRAWN', 'Withdrawn by the lead Author.'))
  )
    throw conflict('This request is no longer pending.');
  if (!(await repository.setStatus(db, projectId, 'FINAL_APPROVAL_PENDING', 'ACTIVE')))
    throw conflict('The project changed.');
  await record(db, projectId, userId, 'FINAL_APPROVAL_WITHDRAWN', requestId);
  return detail(db, projectId, userId);
}
