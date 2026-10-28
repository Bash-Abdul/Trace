import { invalidatePending } from '../final-approval/final-approval.service.js';
import type { PoolClient } from 'pg';
import { withTransaction } from '../../config/db.js';
import { conflict, forbidden, notFound } from '../../utils/app-error.js';
import * as projects from '../projects/projects.repository.js';
import { enqueue } from '../notifications/notifications.repository.js';
import * as repository from './deliverables.repository.js';
import type { Params, DraftInput, Detail } from './deliverables.types.js';
async function detail(db: PoolClient, params: Params): Promise<Detail> {
  const deliverable = await repository.requirement(db, params);
  if (!deliverable) throw notFound('Deliverable not found');
  const draft = await repository.draft(db, params.deliverableId);
  const submissions = await repository.versions(db, params.deliverableId);
  return {
    deliverable,
    draft,
    submissions,
    version: draft?.version ?? 0,
    state: draft?.state ?? 'NOT_STARTED',
    currentSubmissionId:
      draft?.state === 'SUBMITTED' && !deliverable.archived_at
        ? (submissions[0]?.id ?? null)
        : null,
  };
}
export async function read(params: Params, userId: string): Promise<Detail> {
  return withTransaction(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (!(await projects.memberRole(db, params.projectId, userId)))
      throw notFound('Project not found');
    return detail(db, params);
  });
}
async function context(
  db: PoolClient,
  params: Params,
  userId: string,
  version: number,
  leadOnly = false,
) {
  const project = await projects.findMemberProjectForUpdate(db, params.projectId, userId);
  if (!project) throw notFound('Project not found');
  if (!(leadOnly ? ['LEAD_AUTHOR'] : ['LEAD_AUTHOR', 'AUTHOR']).includes(project.role))
    throw forbidden('Your project role does not allow this action.');
  if (!['ACTIVE', 'FINAL_APPROVAL_PENDING'].includes(project.status))
    throw conflict('Activate the project before preparing final deliverables.');
  const deliverable = await repository.requirement(db, params);
  if (!deliverable) throw notFound('Deliverable not found');
  const draft = await repository.draft(db, params.deliverableId);
  const current = {
    deliverable,
    draft,
    version: draft?.version ?? 0,
    state: draft?.state ?? 'NOT_STARTED',
  };
  if (current.deliverable.archived_at)
    throw conflict('This deliverable was removed from the plan. Its history remains available.');
  if (current.version !== version)
    throw conflict('This deliverable changed. Reload before continuing.', 'DELIVERABLE_STALE');
  return current;
}
async function record(
  db: PoolClient,
  params: Params,
  userId: string,
  action: string,
  submissionId?: string,
) {
  await invalidatePending(db, params.projectId, userId);
  await projects.touch(db, params.projectId);
  const details = {
    deliverableId: params.deliverableId,
    ...(submissionId ? { submissionId } : {}),
  };
  await projects.event(db, params.projectId, userId, action, details);
  if (action !== 'DELIVERABLE_DRAFT_SAVED')
    await enqueue(
      db,
      params.projectId,
      userId,
      action,
      ['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER'],
      details,
    );
}
export async function saveDraft(
  db: PoolClient,
  params: Params,
  userId: string,
  input: DraftInput,
): Promise<Detail> {
  const current = await context(db, params, userId, input.version);
  if (current.state === 'SUBMITTED')
    throw conflict('Start a revision to change a submitted deliverable.');
  const unchanged =
    current.draft?.kind === input.kind &&
    current.draft.content === input.content &&
    current.draft.note === input.note;
  const editorId = unchanged ? current.draft!.updated_by : userId;
  if (!(await repository.save(db, params.deliverableId, editorId, input)))
    throw conflict('This draft changed.', 'DELIVERABLE_STALE');
  await record(db, params, userId, 'DELIVERABLE_DRAFT_SAVED');
  return detail(db, params);
}
export async function submit(
  db: PoolClient,
  params: Params,
  userId: string,
  version: number,
): Promise<Detail> {
  const current = await context(db, params, userId, version, true);
  if (current.state !== 'DRAFT' || !current.draft)
    throw conflict('Save a draft before submitting this deliverable.');
  if (!(await projects.hasRole(db, params.projectId, 'MAIN_REVIEWER')))
    throw conflict('Your main Reviewer must join first.');
  const id = await repository.submit(db, current.deliverable, current.draft, userId);
  if (!(await repository.transition(db, params.deliverableId, version, 'DRAFT', 'SUBMITTED')))
    throw conflict('This draft changed.', 'DELIVERABLE_STALE');
  await record(db, params, userId, 'DELIVERABLE_SUBMITTED', id);
  return detail(db, params);
}
export async function revise(
  db: PoolClient,
  params: Params,
  userId: string,
  version: number,
): Promise<Detail> {
  await context(db, params, userId, version);
  if (!(await repository.transition(db, params.deliverableId, version, 'SUBMITTED', 'DRAFT')))
    throw conflict('Only a submitted deliverable can start a revision.');
  await record(db, params, userId, 'DELIVERABLE_REVISION_STARTED');
  return detail(db, params);
}
