import { withTransaction } from '../../config/db.js';
import type { Database } from '../../config/db.js';
import { notFound } from '../../utils/app-error.js';
import * as projects from '../projects/projects.repository.js';
import * as repository from './coverage.repository.js';
import type { Coverage, CoverageState } from './coverage.types.js';
import { randomUUID } from 'node:crypto';
import { badRequest } from '../../utils/app-error.js';
import type { Draft, ProjectStructure, StructureItem } from '../projects/projects.types.js';

// New clients supply stable IDs. Legacy text-only clients may retain exact matches,
// but cannot rename mapped objectives by position.
export function resolveObjectives(
  input: Pick<Draft, 'objectives' | 'objectiveIds'>,
  before: ProjectStructure,
): string[] {
  const known = before.objectiveIds ?? [];
  if (input.objectiveIds && input.objectiveIds.length !== input.objectives.length)
    throw badRequest('Supply one objective ID (or null for a new objective) per objective.');
  const mapped = before.milestones.some((m) => m.objectiveIds?.length);
  const used = new Set<string>();
  return input.objectives.map((title, index) => {
    let id = input.objectiveIds?.[index];
    if (!input.objectiveIds) {
      const matches = before.objectives.flatMap((old, i) => (old === title ? [i] : []));
      if (matches.length === 1) id = known[matches[0]!];
      else if (matches.length > 1 && before.objectives[index] === title) id = known[index];
      else if (
        !mapped &&
        input.objectives.length === before.objectives.length &&
        !input.objectives.includes(before.objectives[index]!)
      )
        id = known[index];
      else if (mapped) throw badRequest('Include objective IDs when changing mapped objectives.');
    }
    if (id && (!known.includes(id) || used.has(id)))
      throw badRequest('Objective IDs must belong to this plan and appear only once.');
    id ??= randomUUID();
    used.add(id);
    return id;
  });
}
export function resolveMilestoneCoverage(
  items: (Draft['milestones'][number] & { id: string })[],
  before: ProjectStructure,
  objectiveIds: string[],
): StructureItem[] {
  return items.map((item) => {
    const old = before.milestones.find((m) => m.id === item.id);
    const links =
      item.objectiveIds ?? old?.objectiveIds?.filter((id) => objectiveIds.includes(id)) ?? [];
    if (new Set(links).size !== links.length || links.some((id) => !objectiveIds.includes(id)))
      throw badRequest('Milestone objectives must belong to this project plan and appear once.');
    const used = new Set<string>();
    const requirements = (item.expectedEvidence ?? old?.expectedEvidence ?? []).map(
      (requirement) => {
        if (
          requirement.id &&
          (!old?.expectedEvidence?.some((r) => r.id === requirement.id) || used.has(requirement.id))
        )
          throw badRequest('Expected evidence IDs must belong to this milestone and appear once.');
        const id = requirement.id ?? randomUUID();
        used.add(id);
        return { id, title: requirement.title, required: requirement.required };
      },
    );
    return { ...item, objectiveIds: [...links].sort(), expectedEvidence: requirements };
  });
}

export function combineStates(states: CoverageState[]): CoverageState {
  // All linked milestone contributions must be accepted. Report the least complete
  // contribution rather than hiding gaps behind another milestone's approval.
  const order: CoverageState[] = [
    'MISSING',
    'REVISION_REQUIRED',
    'DRAFT',
    'SUBMITTED',
    'ACCEPTED_WITH_MILESTONE',
  ];
  return order.find((state) => states.includes(state)) ?? 'MISSING';
}
export async function projectCoverage(
  db: Database,
  projectId: string,
  structure: ProjectStructure,
): Promise<Coverage> {
  const rows = await repository.evidenceStates(db, projectId);
  const states: Record<string, CoverageState> = {
    DRAFT: 'DRAFT',
    AWAITING_REVIEW: 'SUBMITTED',
    REVISION_REQUESTED: 'REVISION_REQUIRED',
    APPROVED: 'ACCEPTED_WITH_MILESTONE',
  };
  const milestones = structure.milestones.map((m) => {
    const contributions = rows.filter((r) => r.milestone_id === m.id);
    const mappedState = (id: string, kind: 'objective_id' | 'expectation_id'): CoverageState => {
      const row = contributions.find((r) => r[kind] === id);
      return row ? (states[row.state] ?? 'MISSING') : 'MISSING';
    };
    return {
      id: m.id,
      title: m.title,
      required: m.required,
      objectives: (m.objectiveIds ?? []).map((id) => ({
        id,
        title: structure.objectives[structure.objectiveIds!.indexOf(id)]!,
        state: mappedState(id, 'objective_id'),
      })),
      expectedEvidence: (m.expectedEvidence ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        required: r.required,
        state: mappedState(r.id, 'expectation_id'),
      })),
    };
  });
  return {
    milestones,
    objectives: structure.objectives.map((title, index) => {
      const id = structure.objectiveIds![index]!;
      return {
        id,
        title,
        state: combineStates(
          milestones.flatMap((m) => m.objectives.filter((o) => o.id === id).map((o) => o.state)),
        ),
      };
    }),
    requiredOmissions: milestones
      .filter((m) => m.required)
      .flatMap((m) =>
        m.expectedEvidence
          .filter((r) => r.required && r.state === 'MISSING')
          .map((r) => ({ milestoneId: m.id, expectationId: r.id, title: r.title })),
      ),
  };
}
export async function read(projectId: string, userId: string): Promise<Coverage> {
  return withTransaction(async (db) => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (!(await projects.memberRole(db, projectId, userId))) throw notFound('Project not found');
    return projectCoverage(db, projectId, await projects.structure(db, projectId));
  });
}
