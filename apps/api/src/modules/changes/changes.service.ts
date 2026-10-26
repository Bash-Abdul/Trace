import {
  resolveObjectives,
  resolveMilestoneCoverage,
} from '../evidence-coverage/coverage.service.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from 'pg';
import type { Database } from '../../config/db.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/app-error.js';
import * as projects from '../projects/projects.repository.js';
import { enqueue } from '../notifications/notifications.repository.js';
import type {
  MemberProject,
  ProposalSnapshot,
  Role,
  StructureItem,
} from '../projects/projects.types.js';
import * as repository from './changes.repository.js';
import type {
  Change,
  ChangeInput,
  MinorInput,
  ChangeDecision,
  ChangeState,
} from './changes.types.js';

async function member(db: PoolClient, id: string, userId: string, roles: Role[]) {
  const project = await projects.findMemberProjectForUpdate(db, id, userId);
  if (!project) throw notFound('Project not found');
  if (!roles.includes(project.role))
    throw forbidden('Your project role does not allow this change.');
  if (project.status !== 'ACTIVE')
    throw conflict('Changes are available only for active projects.');
  return project;
}
async function snapshot(db: PoolClient, project: MemberProject): Promise<ProposalSnapshot> {
  return {
    title: project.title,
    description: project.description,
    ...(await projects.structure(db, project.id)),
  };
}
function items(
  input: ChangeInput['milestones'],
  existing: StructureItem[],
): (ChangeInput['milestones'][number] & { id: string })[] {
  const seen = new Set<string>();
  return input.map((item) => {
    if (item.id && (!existing.some((old) => old.id === item.id) || seen.has(item.id))) {
      throw badRequest('Use each existing item ID once; omit the ID only for a new item.');
    }
    const id = item.id ?? randomUUID();
    seen.add(id);
    return { ...item, id, title: item.title, required: item.required };
  });
}
function proposed(input: ChangeInput, known: ProposalSnapshot): ProposalSnapshot {
  const objectiveIds = resolveObjectives(input, known);
  return {
    objectiveIds,
    title: input.title,
    description: input.description,
    objectives: input.objectives,
    milestones: resolveMilestoneCoverage(
      items(input.milestones, known.milestones),
      known,
      objectiveIds,
    ),
    deliverables: items(input.deliverables, known.deliverables).map(({ id, title, required }) => ({
      id,
      title,
      required,
    })),
  };
}
// Older saved change proposals predate stable objective IDs and evidence requirements.
// Compare their original fields only when the current plan still has no coverage links.
function matchesSnapshot(saved: ProposalSnapshot, current: ProposalSnapshot): boolean {
  if (saved.objectiveIds) return isDeepStrictEqual(saved, current);
  if (current.milestones.some((m) => m.objectiveIds?.length || m.expectedEvidence?.length))
    return false;
  const plain = (items: StructureItem[]) =>
    items.map(({ id, title, required }) => ({ id, title, required }));
  return isDeepStrictEqual(saved, {
    title: current.title,
    description: current.description,
    objectives: current.objectives,
    milestones: plain(current.milestones),
    deliverables: plain(current.deliverables),
  });
}
function changed(before: ProposalSnapshot, after: ProposalSnapshot) {
  if (isDeepStrictEqual(before, after)) throw badRequest('Make a change before saving.');
}
async function currentChange(
  db: PoolClient,
  projectId: string,
  id: string,
  version: number,
): Promise<Change> {
  const change = await repository.find(db, projectId, id);
  if (!change) throw notFound('Project change not found');
  if (change.version !== version)
    throw conflict('This change was updated. Reload before continuing.', 'CHANGE_STALE');
  return change;
}
async function record(
  db: PoolClient,
  projectId: string,
  userId: string,
  action: string,
  details: object,
  roles: Role[],
) {
  await projects.touch(db, projectId);
  await projects.event(db, projectId, userId, action, details);
  await enqueue(db, projectId, userId, action, roles, details);
}
export async function list(db: Database, projectId: string, userId: string) {
  if (!(await projects.memberRole(db, projectId, userId))) throw notFound('Project not found');
  return repository.list(db, projectId);
}
export async function minor(db: PoolClient, projectId: string, userId: string, input: MinorInput) {
  const project = await member(db, projectId, userId, ['LEAD_AUTHOR', 'AUTHOR']);
  if (project.version !== input.version)
    throw conflict('This project changed. Reload before editing.');
  if (await repository.hasOpen(db, projectId))
    throw conflict('Finish or withdraw the open project change before making a minor edit.');
  const before = await snapshot(db, project);
  const after = proposed(input, before);
  if (
    !isDeepStrictEqual(before.objectives, after.objectives) &&
    isDeepStrictEqual([...before.objectives].sort(), [...after.objectives].sort())
  ) {
    throw badRequest('Reordering objectives needs a major change proposal.');
  }
  const shape = (entries: StructureItem[]) =>
    entries.map((i) => ({ id: i.id, required: i.required }));
  if (
    !isDeepStrictEqual(before.objectiveIds, after.objectiveIds) ||
    !isDeepStrictEqual(
      before.milestones.map((m) => ({
        objectiveIds: m.objectiveIds,
        expectedEvidence: m.expectedEvidence,
      })),
      after.milestones.map((m) => ({
        objectiveIds: m.objectiveIds,
        expectedEvidence: m.expectedEvidence,
      })),
    ) ||
    before.objectives.length !== after.objectives.length ||
    !isDeepStrictEqual(shape(before.milestones), shape(after.milestones)) ||
    !isDeepStrictEqual(shape(before.deliverables), shape(after.deliverables))
  ) {
    throw badRequest(
      'Adding, removing, reordering or changing requiredness needs a major change proposal.',
    );
  }
  changed(before, after);
  await projects.updateBrief(db, projectId, { ...after, version: input.version });
  await projects.saveStructure(db, projectId, { ...after, objectiveIds: after.objectiveIds! });
  await record(
    db,
    projectId,
    userId,
    'PROJECT_MINOR_EDIT',
    { before, after, reason: input.reason, meaningUnchanged: input.meaningUnchanged },
    ['MAIN_REVIEWER'],
  );
}
export async function create(
  db: PoolClient,
  projectId: string,
  userId: string,
  input: ChangeInput,
) {
  const project = await member(db, projectId, userId, ['LEAD_AUTHOR', 'AUTHOR']);
  if (project.version !== input.version)
    throw conflict('This project changed. Reload before proposing changes.');
  if (await repository.hasOpen(db, projectId))
    throw conflict('There is already an open project change.');
  const before = await snapshot(db, project);
  const after = proposed(input, before);
  changed(before, after);
  const change = await repository.insert(db, projectId, userId, input.reason, before, after);
  await record(db, projectId, userId, 'PROJECT_CHANGE_DRAFTED', { changeId: change.id }, []);
  return change;
}
export async function edit(
  db: PoolClient,
  projectId: string,
  id: string,
  userId: string,
  input: ChangeInput,
) {
  await member(db, projectId, userId, ['LEAD_AUTHOR', 'AUTHOR']);
  const change = await currentChange(db, projectId, id, input.version);
  if (change.state !== 'DRAFT') throw conflict('Only a draft change can be edited.');
  const after = proposed(input, {
    ...change.before_structure,
    objectives: [...change.before_structure.objectives, ...change.after_structure.objectives],
    objectiveIds: [
      ...(change.before_structure.objectiveIds ?? []),
      ...(change.after_structure.objectiveIds ?? []),
    ],
    milestones: [
      ...change.after_structure.milestones,
      ...change.before_structure.milestones.filter(
        (m) => !change.after_structure.milestones.some((n) => n.id === m.id),
      ),
    ],
    deliverables: [...change.before_structure.deliverables, ...change.after_structure.deliverables],
  });
  changed(change.before_structure, after);
  if (!(await repository.edit(db, change, input.reason, after)))
    throw conflict('This draft changed.');
  await record(db, projectId, userId, 'PROJECT_CHANGE_EDITED', { changeId: id }, []);
}
export async function act(
  db: PoolClient,
  projectId: string,
  id: string,
  userId: string,
  version: number,
  action: 'SUBMIT' | 'WITHDRAW' | 'APPROVE' | 'REJECT',
  feedback = '',
) {
  const deciding = action === 'APPROVE' || action === 'REJECT';
  const project = await member(
    db,
    projectId,
    userId,
    deciding ? ['MAIN_REVIEWER'] : ['LEAD_AUTHOR'],
  );
  const change = await currentChange(db, projectId, id, version);
  if (
    (action === 'SUBMIT' && change.state !== 'DRAFT') ||
    (deciding && change.state !== 'PROPOSED') ||
    (action === 'WITHDRAW' && !['DRAFT', 'PROPOSED'].includes(change.state))
  )
    throw conflict('This change is no longer available for that action.');
  const currentStructure =
    action === 'SUBMIT' || action === 'APPROVE' ? await snapshot(db, project) : null;
  if (currentStructure) {
    if (!matchesSnapshot(change.before_structure, currentStructure))
      throw conflict(
        'The project structure changed. Withdraw this change and prepare a new proposal.',
      );
  }
  let invalidated: string[] = [];
  if (action === 'APPROVE') {
    const before = currentStructure!;
    const objectiveIds =
      change.after_structure.objectiveIds ?? resolveObjectives(change.after_structure, before);
    const after = {
      ...change.after_structure,
      objectiveIds,
      milestones: resolveMilestoneCoverage(
        change.after_structure.milestones,
        {
          ...before,
          milestones: change.after_structure.milestones,
        },
        objectiveIds,
      ),
    };
    // Wording can change an objective's meaning, so retain conservative invalidation
    // for brief/objective edits. Requirement changes invalidate their own milestone.
    const scopeChanged =
      before.title !== after.title ||
      before.description !== after.description ||
      !isDeepStrictEqual(before.objectives, after.objectives);
    const affected = before.milestones
      .filter((old) => {
        const next = after.milestones.find((i) => i.id === old.id);
        return (
          !next ||
          scopeChanged ||
          old.title !== next.title ||
          old.required !== next.required ||
          !isDeepStrictEqual(old.objectiveIds, next.objectiveIds) ||
          !isDeepStrictEqual(old.expectedEvidence, next.expectedEvidence)
        );
      })
      .map((i) => i.id);
    const states = await repository.milestoneStates(db, projectId);
    if (states.some((s) => affected.includes(s.id) && s.state === 'AWAITING_REVIEW')) {
      throw conflict(
        'Review the pending submissions on affected milestones before applying this change.',
      );
    }
    await repository.archiveRemoved(db, projectId, after);
    await projects.updateBrief(db, projectId, { ...after, version: project.version });
    await projects.saveStructure(db, projectId, after);
    const retained = affected.filter((id) => after.milestones.some((i) => i.id === id));
    invalidated = states
      .filter((s) => retained.includes(s.id) && s.state === 'APPROVED')
      .map((s) => s.id);
    await repository.reviseMilestones(db, retained);
  }
  const states: Record<typeof action, ChangeState> = {
    SUBMIT: 'PROPOSED',
    WITHDRAW: 'WITHDRAWN',
    APPROVE: 'APPROVED_AND_APPLIED',
    REJECT: 'REJECTED',
  };
  if (
    !(await repository.transition(db, change, states[action], userId, deciding ? feedback : null))
  )
    throw conflict('This change was already updated.');
  await record(
    db,
    projectId,
    userId,
    `PROJECT_CHANGE_${action === 'SUBMIT' ? 'SUBMITTED' : action === 'WITHDRAW' ? 'WITHDRAWN' : 'DECIDED'}`,
    { changeId: id, decision: action, invalidatedMilestoneIds: invalidated },
    deciding ? ['LEAD_AUTHOR', 'AUTHOR'] : ['MAIN_REVIEWER'],
  );
}
export async function decide(
  db: PoolClient,
  projectId: string,
  id: string,
  userId: string,
  input: ChangeDecision,
) {
  return act(db, projectId, id, userId, input.version, input.decision, input.feedback);
}
