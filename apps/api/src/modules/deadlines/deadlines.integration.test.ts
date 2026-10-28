import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('An isolated _test database is required');
process.env.DATABASE_URL = url;
const { pool, withTransaction } = await import('../../config/db.js');
const projects = await import('../projects/projects.service.js');
const repository = await import('../projects/projects.repository.js');
const changes = await import('../changes/changes.service.js');
const milestones = await import('../milestones/milestones.service.js');
let lead: string, reviewer: string;
let project: Awaited<ReturnType<typeof projects.createProject>>;
const ids: string[] = [];
beforeAll(async () => {
  const users = await pool.query<{ id: string }>(
    'INSERT INTO users(email,password_hash,email_verified_at) VALUES ($1,$3,now()), ($2,$3,now()) RETURNING id',
    [
      `date-lead-${randomUUID()}@example.com`,
      `date-reviewer-${randomUUID()}@example.com`,
      'unused-test-only',
    ],
  );
  [lead, reviewer] = users.rows.map((r) => r.id) as [string, string];
});
beforeEach(async () => {
  project = await withTransaction((db) =>
    projects.createProject(db, lead, {
      title: 'Optional dates',
      description: 'Calendar deadlines',
      objectives: ['Explore'],
      projectType: 'INDIVIDUAL',
      approvalRoute: 'IN_PLATFORM_PROPOSAL',
      templateKey: 'custom',
      creatorRole: 'LEAD_AUTHOR',
      milestones: [{ title: 'Research', required: true }],
      deliverables: [{ title: 'Report', required: true }],
    }),
  );
  ids.push(project.id);
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[lead, reviewer]]);
  await pool.end();
});
async function scheduled() {
  project = await withTransaction((db) =>
    projects.updateDraft(db, project.id, lead, {
      ...project,
      dueDate: '2026-12-20',
      timezone: 'Europe/London',
      milestones: project.milestones.map((m) => ({ ...m, dueDate: '2026-11-01' })),
    }),
  );
  return project;
}
describe('project and milestone dates', () => {
  it('keeps optional dates empty, validates timezone and retains dates when older clients omit fields', async () => {
    expect(project.dueDate).toBeNull();
    expect(project.events.find((e) => e.action === 'PROJECT_CREATED')?.details).toMatchObject({
      schedule: {
        dueDate: null,
        timezone: null,
        milestones: [{ id: project.milestones[0]!.id, dueDate: null }],
      },
    });
    expect(project.deadline?.state).toBe('NO_DUE_DATE');
    await expect(
      withTransaction((db) =>
        projects.updateDraft(db, project.id, lead, { ...project, dueDate: '2026-12-20' }),
      ),
    ).rejects.toThrow('timezone');
    await scheduled();
    const updated = await withTransaction((db) =>
      projects.updateDraft(db, project.id, lead, {
        ...project,
        dueDate: undefined,
        timezone: undefined,
        milestones: project.milestones.map(({ id, title, required }) => ({ id, title, required })),
      }),
    );
    expect(updated.dueDate).toBe('2026-12-20');
    expect(updated.timezone).toBe('Europe/London');
    expect(updated.milestones[0]!.dueDate).toBe('2026-11-01');
    expect((await projects.listProjects(pool, lead))[0]!.progress.milestones[0]!.dueDate).toBe(
      '2026-11-01',
    );
    const cleared = await withTransaction((db) =>
      projects.updateDraft(db, project.id, lead, {
        ...updated,
        dueDate: null,
        timezone: null,
        milestones: updated.milestones.map((m) => ({ ...m, dueDate: null })),
      }),
    );
    expect(cleared.dueDate).toBeNull();
    expect(cleared.milestones[0]!.dueDate).toBeNull();
  });
  it('preserves proposal and submission dates while reviewed date-only changes retain approvals', async () => {
    await scheduled();
    await withTransaction((db) => repository.addMember(db, project.id, reviewer, 'MAIN_REVIEWER'));
    project = await withTransaction((db) =>
      projects.submitProposal(db, project.id, lead, project.version),
    );
    const proposal = project.proposals[0]!;
    project = await withTransaction((db) =>
      projects.decideProposal(db, project.id, proposal.id, reviewer, {
        version: project.version,
        decision: 'APPROVE',
        feedback: '',
      }),
    );
    const params = { projectId: project.id, milestoneId: project.milestones[0]!.id };
    let detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, {
        version: 0,
        evidence: [{ title: 'Notes', kind: 'TEXT', content: 'Findings' }],
      }),
    );
    detail = await withTransaction((db) => milestones.submit(db, params, lead, detail.version));
    detail = await withTransaction((db) =>
      milestones.decide(db, params, detail.submissions[0]!.id, reviewer, {
        version: detail.version,
        decision: 'APPROVE',
        feedback: '',
      }),
    );
    const input = {
      ...project,
      reason: 'Move the schedule',
      dueDate: null,
      timezone: 'America/New_York',
      milestones: project.milestones.map((m) => ({ ...m, dueDate: '2020-01-01' })),
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
    expect((await projects.getProject(pool, project.id, lead)).dueDate).toBe('2026-12-20');
    await withTransaction((db) =>
      changes.act(db, project.id, change.id, reviewer, change.version, 'APPROVE'),
    );
    const final = await projects.getProject(pool, project.id, lead);
    expect(final.dueDate).toBeNull();
    expect(final.timezone).toBe('America/New_York');
    expect(final.progress.milestones[0]!.deadline?.state).toBe('APPROVED');
    expect(final.proposals[0]!.structure.dueDate).toBe('2026-12-20');
    detail = await milestones.read(params, lead);
    expect(detail.state).toBe('APPROVED');
    expect(detail.submissions[0]!.coverage?.dueDate).toBe('2026-11-01');
    expect(detail.submissions[0]!.coverage?.timezone).toBe('Europe/London');
  });
  it('rejects concurrent stale date changes and permits submitting overdue evidence', async () => {
    const updates = await Promise.allSettled(
      ['2026-12-01', '2026-12-02'].map((dueDate) =>
        withTransaction((db) =>
          projects.updateDraft(db, project.id, lead, { ...project, dueDate, timezone: 'UTC' }),
        ),
      ),
    );
    expect(updates.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    project = await projects.getProject(pool, project.id, lead);
    project = await withTransaction((db) =>
      projects.updateDraft(db, project.id, lead, {
        ...project,
        milestones: project.milestones.map((m) => ({ ...m, dueDate: '2020-01-01' })),
      }),
    );
    await withTransaction(async (db) => {
      await repository.addMember(db, project.id, reviewer, 'MAIN_REVIEWER');
      await db.query("UPDATE projects SET status = 'ACTIVE' WHERE id = $1", [project.id]);
    });
    const params = { projectId: project.id, milestoneId: project.milestones[0]!.id };
    let detail = await withTransaction((db) =>
      milestones.saveDraft(db, params, lead, {
        version: 0,
        evidence: [{ title: 'Late notes', kind: 'TEXT', content: 'Still accepted for review' }],
      }),
    );
    expect(detail.deadline?.state).toBe('OVERDUE');
    detail = await withTransaction((db) => milestones.submit(db, params, lead, detail.version));
    expect(detail.state).toBe('AWAITING_REVIEW');
  });
});
