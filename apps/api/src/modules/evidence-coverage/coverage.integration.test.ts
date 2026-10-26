import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('An isolated _test database is required');
process.env.DATABASE_URL = url;
const { pool, withTransaction } = await import('../../config/db.js');
const projects = await import('../projects/projects.service.js');
const repository = await import('../projects/projects.repository.js');
const milestones = await import('../milestones/milestones.service.js');
const changes = await import('../changes/changes.service.js');
const coverage = await import('./coverage.service.js');
const users: string[] = [];
const projectIds: string[] = [];
let lead: string, reviewer: string, outsider: string;
let project: Awaited<ReturnType<typeof projects.createProject>>;
let params: { projectId: string; milestoneId: string };
const sample = {
  title: 'Interview results',
  kind: 'TEXT' as const,
  content: 'Three participant interviews.',
};
beforeAll(async () => {
  for (let i = 0; i < 3; i++) {
    const result = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash, email_verified_at) VALUES ($1, $2, now()) RETURNING id',
      [`coverage-${randomUUID()}@example.com`, 'test-only-unused-password'],
    );
    users.push(result.rows[0]!.id);
  }
  [lead, reviewer, outsider] = users as [string, string, string];
});
beforeEach(async () => {
  project = await withTransaction((db) =>
    projects.createProject(db, lead, {
      title: 'Coverage study',
      description: 'Evidence and objectives',
      objectives: ['Understand needs', 'Evaluate outcome'],
      projectType: 'GROUP',
      approvalRoute: 'EXTERNALLY_APPROVED',
      templateKey: 'custom',
      creatorRole: 'LEAD_AUTHOR',
      milestones: [
        { title: 'Research', required: true },
        { title: 'Evaluation', required: false },
      ],
      deliverables: [{ title: 'Report', required: true }],
    }),
  );
  projectIds.push(project.id);
  project = await withTransaction((db) =>
    projects.updateDraft(db, project.id, lead, {
      ...project,
      version: project.version,
      milestones: project.milestones.map((m, i) => ({
        ...m,
        objectiveIds: [project.objectiveIds![i]!],
        expectedEvidence: [
          { title: i ? 'Evaluation notes' : 'Interview notes', required: true },
          { title: 'Extra context', required: false },
        ],
      })),
    }),
  );
  await withTransaction(async (db) => {
    await repository.addMember(db, project.id, reviewer, 'MAIN_REVIEWER');
    await db.query("UPDATE projects SET status = 'ACTIVE' WHERE id = $1", [project.id]);
  });
  params = { projectId: project.id, milestoneId: project.milestones[0]!.id };
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
  await pool.end();
});
function mapped() {
  return {
    ...sample,
    objectiveIds: [project.objectiveIds![0]!],
    expectationIds: [project.milestones[0]!.expectedEvidence![0]!.id],
  };
}
async function currentState() {
  return (await coverage.read(project.id, lead)).milestones[0]!.expectedEvidence[0]!.state;
}
describe('evidence coverage', () => {
  it('applies a pre-migration change without rewriting its saved snapshots', async () => {
    await withTransaction(async (db) => {
      await db.query('DELETE FROM milestone_objectives WHERE project_id = $1', [project.id]);
      await db.query(
        'DELETE FROM milestone_expected_evidence WHERE milestone_id = ANY($1::uuid[])',
        [project.milestones.map((m) => m.id)],
      );
    });
    const before = {
      title: project.title,
      description: project.description,
      objectives: project.objectives,
      milestones: project.milestones.map(({ id, title, required }) => ({ id, title, required })),
      deliverables: project.deliverables,
    };
    const after = { ...before, description: 'Legacy proposed scope adjustment' };
    const changeRepository = await import('../changes/changes.repository.js');
    let change = await withTransaction((db) =>
      changeRepository.insert(db, project.id, lead, 'Saved before the migration', before, after),
    );
    await withTransaction((db) =>
      changes.act(db, project.id, change.id, lead, change.version, 'SUBMIT'),
    );
    change = (await changes.list(pool, project.id, lead))[0]!;
    await withTransaction((db) =>
      changes.act(db, project.id, change.id, reviewer, change.version, 'APPROVE'),
    );
    expect((await projects.getProject(pool, project.id, lead)).objectiveIds).toEqual(
      project.objectiveIds,
    );
    expect((await changes.list(pool, project.id, lead))[0]!.after_structure).toEqual(after);
  });

  it('reports uncovered contributions instead of hiding them behind another approval', () => {
    expect(coverage.combineStates(['ACCEPTED_WITH_MILESTONE', 'MISSING'])).toBe('MISSING');
    expect(coverage.combineStates(['ACCEPTED_WITH_MILESTONE', 'SUBMITTED'])).toBe('SUBMITTED');
    expect(coverage.combineStates(['REVISION_REQUIRED', 'DRAFT'])).toBe('REVISION_REQUIRED');
    expect(coverage.combineStates([])).toBe('MISSING');
  });

  it('derives factual draft, submission, revision and acceptance states, retaining snapshots', async () => {
    expect(await currentState()).toBe('MISSING');
    expect((await coverage.read(project.id, lead)).requiredOmissions).toHaveLength(1);
    let detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, { version: 0, evidence: [mapped()] }),
    );
    expect(await currentState()).toBe('DRAFT');
    detail = await withTransaction((db) => milestones.submit(db, params, lead, detail.version));
    expect(await currentState()).toBe('SUBMITTED');
    expect(detail.submissions[0]!.coverage?.expectedEvidence).toHaveLength(2);
    expect(detail.submissions[0]!.evidence[0]!.objectiveMappings?.[0]?.title).toBe(
      'Understand needs',
    );
    detail = await withTransaction((db) =>
      milestones.decide(db, params, detail.submissions[0]!.id, reviewer, {
        version: detail.version,
        decision: 'REQUEST_REVISION',
        feedback: 'Include more participants',
      }),
    );
    expect(await currentState()).toBe('REVISION_REQUIRED');
    detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, {
        version: detail.version,
        evidence: [{ ...mapped(), id: detail.evidence[0]!.id, content: 'Five interviews' }],
      }),
    );
    expect(await currentState()).toBe('DRAFT');
    detail = await withTransaction((db) => milestones.submit(db, params, lead, detail.version));
    detail = await withTransaction((db) =>
      milestones.decide(db, params, detail.submissions[0]!.id, reviewer, {
        version: detail.version,
        decision: 'APPROVE',
        feedback: '',
      }),
    );
    expect(await currentState()).toBe('ACCEPTED_WITH_MILESTONE');
    expect(detail.submissions[1]!.evidence[0]!.content).toBe(sample.content);
    const report = await coverage.read(project.id, reviewer);
    expect(report.objectives[0]!.state).toBe('ACCEPTED_WITH_MILESTONE');
    expect(report.objectives[1]!.state).toBe('MISSING');
    expect(report.requiredOmissions).toEqual([]);
    await expect(
      pool.query("UPDATE milestone_submission_coverage SET plan = '{}' WHERE submission_id = $1", [
        detail.submissions[0]!.id,
      ]),
    ).rejects.toThrow('immutable');
  });
  it('rejects cross-milestone, foreign and duplicate mappings at service and database boundaries', async () => {
    const foreignRequirement = project.milestones[1]!.expectedEvidence![0]!.id;
    for (const item of [
      { ...mapped(), expectationIds: [foreignRequirement] },
      { ...mapped(), objectiveIds: [project.objectiveIds![1]!] },
      { ...mapped(), objectiveIds: [randomUUID()] },
      { ...mapped(), expectationIds: [mapped().expectationIds[0]!, mapped().expectationIds[0]!] },
    ])
      await expect(
        withTransaction((db) =>
          milestones.saveDraft(db, params, lead, { version: 0, evidence: [item] }),
        ),
      ).rejects.toThrow('mappings');
    const detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, { version: 0, evidence: [mapped()] }),
    );
    await expect(
      pool.query(
        'INSERT INTO evidence_expectations (milestone_id, evidence_id, expectation_id) VALUES ($1,$2,$3)',
        [params.milestoneId, detail.evidence[0]!.id, foreignRequirement],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(coverage.read(project.id, outsider)).rejects.toThrow('Project not found');
    await expect(
      withTransaction((db) =>
        milestones.saveDraft(db, params, reviewer, { version: detail.version, evidence: [] }),
      ),
    ).rejects.toThrow('role');
  });
  it('preserves IDs and mapping ownership across reorder, removal, empty drafts and concurrent edits', async () => {
    let detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, {
        version: 0,
        evidence: [mapped(), { ...sample, title: 'Context' }],
      }),
    );
    const evidenceId = detail.evidence[0]!.id;
    detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, {
        version: detail.version,
        evidence: [...detail.evidence].reverse(),
      }),
    );
    expect(detail.evidence[1]!.id).toBe(evidenceId);
    expect(detail.evidence[1]!.expectationIds).toEqual(mapped().expectationIds);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        withTransaction((db) =>
          milestones.saveDraft(db, params, lead, { version: detail.version, evidence: [] }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await currentState()).toBe('MISSING');
    expect((await milestones.read(params, lead)).evidence).toEqual([]);
  });
  it('requires reviewed changes for expectations and invalidates approval without rewriting submitted mappings', async () => {
    let detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, { version: 0, evidence: [mapped()] }),
    );
    detail = await withTransaction((db) => milestones.submit(db, params, lead, detail.version));
    detail = await withTransaction((db) =>
      milestones.decide(db, params, detail.submissions[0]!.id, reviewer, {
        version: detail.version,
        decision: 'APPROVE',
        feedback: '',
      }),
    );
    const current = await projects.getProject(pool, project.id, lead);
    const input = {
      ...current,
      reason: 'Require participant consent notes',
      milestones: current.milestones.map((m, i) =>
        i
          ? m
          : {
              ...m,
              expectedEvidence: [
                { ...m.expectedEvidence![0]!, title: 'Interview and consent notes' },
              ],
            },
      ),
    };
    await expect(
      withTransaction((db) =>
        changes.minor(db, project.id, lead, { ...input, meaningUnchanged: true }),
      ),
    ).rejects.toThrow('major change');
    let change = await withTransaction((db) => changes.create(db, project.id, lead, input));
    await withTransaction((db) =>
      changes.act(db, project.id, change.id, lead, change.version, 'SUBMIT'),
    );
    change = (await changes.list(pool, project.id, lead))[0]!;
    await withTransaction((db) =>
      changes.act(db, project.id, change.id, reviewer, change.version, 'APPROVE'),
    );
    expect(await currentState()).toBe('REVISION_REQUIRED');
    detail = await milestones.read(params, lead);
    expect(detail.submissions[0]!.evidence[0]!.expectationMappings?.[0]?.title).toBe(
      'Interview notes',
    );
    expect(detail.submissions[0]!.coverage?.expectedEvidence[0]!.title).toBe('Interview notes');
    expect(
      (await projects.getProject(pool, project.id, lead)).milestones[0]!.expectedEvidence![0]!.id,
    ).toBe(mapped().expectationIds[0]);
  });
  it('keeps objective identity during reorder and blocks position-based reassignment of mapped objectives', async () => {
    await pool.query("UPDATE projects SET status = 'SETUP' WHERE id = $1", [project.id]);
    const initialIds = project.objectiveIds!;
    const updated = await withTransaction((db) =>
      projects.updateDraft(db, project.id, lead, {
        ...project,
        objectives: [...project.objectives].reverse(),
        objectiveIds: [...initialIds].reverse(),
      }),
    );
    expect(updated.objectiveIds).toEqual([...initialIds].reverse());
    expect(updated.milestones[0]!.objectiveIds).toEqual([initialIds[0]]);
    await expect(
      withTransaction((db) =>
        projects.updateDraft(db, project.id, lead, {
          ...updated,
          objectiveIds: undefined,
          objectives: ['Renamed', 'Other'],
        }),
      ),
    ).rejects.toThrow('objective IDs');
    const removed = await withTransaction((db) =>
      projects.updateDraft(db, project.id, lead, {
        ...updated,
        objectives: [updated.objectives[0]!],
        objectiveIds: [updated.objectiveIds![0]!],
        milestones: updated.milestones.map((m) => ({
          ...m,
          objectiveIds: m.objectiveIds?.filter((id) => id !== initialIds[0]),
          expectedEvidence: [],
        })),
      }),
    );
    expect(removed.objectiveIds).toEqual([initialIds[1]]);
    expect(removed.milestones[0]!.expectedEvidence).toEqual([]);
  });
});
