import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChangeInput } from './changes.types.js';
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('Changes require an isolated _test database');
process.env.DATABASE_URL = testUrl;
const { pool, withTransaction: tx } = await import('../../config/db.js');
const projects = await import('../projects/projects.service.js');
const projectRepo = await import('../projects/projects.repository.js');
const changes = await import('./changes.service.js');
const milestones = await import('../milestones/milestones.service.js');
const { minorSchema, changeSchema } = await import('./changes.schema.js');
const users = Array.from({ length: 5 }, () => randomUUID());
const [author, reviewer, teammate, dormant, outsider] = users as [
  string,
  string,
  string,
  string,
  string,
];
const projectIds: string[] = [];
beforeAll(async () => {
  for (const id of users)
    await pool.query(
      'INSERT INTO users (id, email, password_hash, email_verified_at) VALUES ($1,$2,$3,now())',
      [id, `changes-${id}@example.com`, 'unused-test-hash'],
    );
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
  await pool.end();
});
async function setup() {
  const project = await tx((db) =>
    projects.createProject(db, author, {
      title: 'Approved research',
      description: 'Investigate library access.',
      objectives: ['Understand access', 'Evaluate outcomes'],
      projectType: 'GROUP',
      approvalRoute: 'EXTERNALLY_APPROVED',
      creatorRole: 'LEAD_AUTHOR',
      templateKey: 'custom',
      milestones: [
        { title: 'Research', required: true },
        { title: 'Design', required: true },
        { title: 'Reflection', required: false },
      ],
      deliverables: [{ title: 'Report', required: true }],
    }),
  );
  projectIds.push(project.id);
  await tx(async (db) => {
    await projectRepo.addMember(db, project.id, reviewer, 'MAIN_REVIEWER');
    await projectRepo.addMember(db, project.id, teammate, 'AUTHOR');
    await projectRepo.addMember(db, project.id, dormant, 'DORMANT_REVIEWER');
    await projectRepo.activateExternal(db, project.id);
  });
  return projects.getProject(pool, project.id, author);
}
function input(project: Awaited<ReturnType<typeof setup>>) {
  return {
    version: project.version,
    title: project.title,
    description: project.description,
    objectives: project.objectives,
    milestones: project.milestones,
    deliverables: project.deliverables,
    reason: 'Update the approved plan',
  };
}
async function draft(project: Awaited<ReturnType<typeof setup>>, patch: Partial<ChangeInput> = {}) {
  return tx((db) =>
    changes.create(db, project.id, author, {
      ...input(project),
      title: 'Revised research',
      ...patch,
    }),
  );
}
async function submit(projectId: string, id: string, version = 1) {
  await tx((db) => changes.act(db, projectId, id, author, version, 'SUBMIT'));
}
async function approveMilestone(projectId: string, milestoneId: string) {
  const params = { projectId, milestoneId };
  const d = await tx((db) =>
    milestones.saveDraft(db, params, author, {
      version: 0,
      evidence: [
        { title: 'Findings', kind: 'TEXT', content: 'Interviews with five participants.' },
      ],
    }),
  );
  const s = await tx((db) => milestones.submit(db, params, author, d.version));
  return tx((db) =>
    milestones.decide(db, params, s.submissions[0]!.id, reviewer, {
      version: s.version,
      decision: 'APPROVE',
      feedback: 'Good evidence',
    }),
  );
}
describe('controlled active-project changes', () => {
  it('records minor wording history but rejects structural edits, false declarations and outsiders', async () => {
    const p = await setup();
    const minor = { ...input(p), title: 'Approved research.', meaningUnchanged: true as const };
    expect(minorSchema.safeParse({ ...minor, meaningUnchanged: false }).success).toBe(false);
    expect(changeSchema.safeParse({ ...input(p), milestones: [] }).success).toBe(false);
    await expect(
      tx((db) =>
        changes.minor(db, p.id, author, { ...minor, milestones: [...p.milestones].reverse() }),
      ),
    ).rejects.toThrow('major change');
    await expect(
      tx((db) =>
        changes.minor(db, p.id, author, {
          ...minor,
          milestones: p.milestones.map((m, i) => (i ? m : { ...m, required: false })),
        }),
      ),
    ).rejects.toThrow('major change');
    await expect(tx((db) => changes.minor(db, p.id, outsider, minor))).rejects.toThrow('not found');
    await expect(tx((db) => changes.minor(db, p.id, reviewer, minor))).rejects.toThrow('role');
    await tx((db) => changes.minor(db, p.id, teammate, minor));
    const updated = await projects.getProject(pool, p.id, author);
    expect(updated.title).toBe(minor.title);
    expect(updated.events[0]!.details).toMatchObject({
      before: { title: p.title },
      after: { title: minor.title },
      meaningUnchanged: true,
    });
    await expect(tx((db) => changes.minor(db, p.id, author, minor))).rejects.toThrow('changed');
  });
  it('keeps drafts separate, restricts submission/decisions, freezes proposals and rejects duplicate decisions', async () => {
    const p = await setup();
    const c = await draft(p);
    expect((await projects.getProject(pool, p.id, author)).title).toBe(p.title);
    await expect(tx((db) => changes.act(db, p.id, c.id, teammate, 1, 'SUBMIT'))).rejects.toThrow(
      'role',
    );
    await expect(tx((db) => changes.act(db, p.id, c.id, dormant, 1, 'APPROVE'))).rejects.toThrow(
      'role',
    );
    await expect(
      tx((db) => changes.create(db, p.id, author, { ...input(p), version: p.version + 1 })),
    ).rejects.toThrow('already');
    await submit(p.id, c.id);
    await expect(
      tx((db) => changes.edit(db, p.id, c.id, author, { ...input(p), version: 2 })),
    ).rejects.toThrow('draft');
    await expect(
      pool.query("UPDATE project_changes SET reason = 'tampered' WHERE id = $1", [c.id]),
    ).rejects.toMatchObject({ code: '23514' });
    const results = await Promise.allSettled([
      tx((db) => changes.act(db, p.id, c.id, reviewer, 2, 'APPROVE')),
      tx((db) => changes.act(db, p.id, c.id, reviewer, 2, 'APPROVE')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await projects.getProject(pool, p.id, author)).title).toBe('Revised research');
    expect(
      (
        await pool.query(
          "SELECT * FROM project_notifications WHERE project_id=$1 AND action='PROJECT_CHANGE_DECIDED'",
          [p.id],
        )
      ).rowCount,
    ).toBe(2);
  });
  it('archives removed milestones, retains submitted evidence/feedback and swaps IDs without collisions', async () => {
    const p = await setup();
    const first = p.milestones[0]!;
    const approved = await approveMilestone(p.id, first.id);
    await tx((db) =>
      milestones.addFeedback(
        db,
        { projectId: p.id, milestoneId: first.id },
        approved.submissions[0]!.id,
        reviewer,
        { body: 'Preserve this discussion', blocking: true },
      ),
    );
    const c = await draft(p, {
      title: p.title,
      milestones: [p.milestones[2]!, p.milestones[1]!, { title: 'New stage', required: true }],
    });
    await submit(p.id, c.id);
    await tx((db) => changes.act(db, p.id, c.id, reviewer, 2, 'APPROVE'));
    const updated = await projects.getProject(pool, p.id, author);
    expect(updated.milestones.map((m) => m.id)).toEqual(
      c.after_structure.milestones.map((m) => m.id),
    );
    expect(updated.archived_milestones.map((m) => m.id)).toEqual([first.id]);
    const history = await milestones.read({ projectId: p.id, milestoneId: first.id }, author);
    expect(history.submissions[0]!.decision).toBe('APPROVE');
    expect(history.feedback).toHaveLength(1);
    await expect(
      tx((db) =>
        milestones.addFeedback(
          db,
          { projectId: p.id, milestoneId: first.id },
          history.submissions[0]!.id,
          reviewer,
          { body: 'New thread', blocking: true },
        ),
      ),
    ).rejects.toThrow('archived');
    await expect(
      tx((db) =>
        milestones.saveDraft(db, { projectId: p.id, milestoneId: first.id }, author, {
          version: history.version,
          evidence: [],
        }),
      ),
    ).rejects.toThrow('removed');
    await tx((db) =>
      milestones.updateFeedback(
        db,
        { projectId: p.id, milestoneId: first.id },
        history.feedback[0]!.id,
        reviewer,
        { version: 1, action: 'RESOLVE', body: 'Resolved with the plan change' },
      ),
    );
  });
  it('invalidates changed milestone approvals without rewriting previous decisions, and protects pending reviews', async () => {
    const p = await setup();
    const first = p.milestones[0]!;
    const approved = await approveMilestone(p.id, first.id);
    const c = await draft(p, {
      title: p.title,
      milestones: p.milestones.map((m, i) => (i ? m : { ...m, title: 'Expanded research' })),
    });
    await submit(p.id, c.id);
    await tx((db) => changes.act(db, p.id, c.id, reviewer, 2, 'APPROVE'));
    const next = await milestones.read({ projectId: p.id, milestoneId: first.id }, author);
    expect(next.state).toBe('REVISION_REQUESTED');
    expect(next.submissions).toEqual(approved.submissions);
    const latest = await projects.getProject(pool, p.id, author);
    const d = await tx((db) =>
      milestones.saveDraft(db, { projectId: p.id, milestoneId: first.id }, author, {
        version: next.version,
        evidence: next.evidence,
      }),
    );
    await tx((db) =>
      milestones.submit(db, { projectId: p.id, milestoneId: first.id }, author, d.version),
    );
    const pending = await draft(latest);
    await submit(p.id, pending.id);
    await expect(
      tx((db) => changes.act(db, p.id, pending.id, reviewer, 2, 'APPROVE')),
    ).rejects.toThrow('pending submissions');
    expect((await changes.list(pool, p.id, author))[0]!.state).toBe('PROPOSED');
  });
  it('rejects stale evidence editors after expectations change and queues only current proposals', async () => {
    const p = await setup();
    const params = { projectId: p.id, milestoneId: p.milestones[0]!.id };
    const draftEvidence = await tx((db) =>
      milestones.saveDraft(db, params, author, {
        version: 0,
        evidence: [{ title: 'Initial notes', kind: 'TEXT', content: 'Existing draft work' }],
      }),
    );
    const change = await draft(p);
    await submit(p.id, change.id);
    const { getQueue } = await import('../reviews/reviews.service.js');
    const reviewerQueue = await getQueue(reviewer);
    expect(reviewerQueue.items.find((i) => i.id === change.id)).toMatchObject({
      kind: 'PROJECT_CHANGE',
      needs_attention: true,
    });
    const authorQueue = await getQueue(author);
    expect(authorQueue.items.find((i) => i.id === change.id)).toMatchObject({
      needs_attention: false,
    });
    await tx((db) => changes.act(db, p.id, change.id, reviewer, 2, 'APPROVE'));
    await expect(
      tx((db) => milestones.submit(db, params, author, draftEvidence.version)),
    ).rejects.toThrow('changed');
    const current = await milestones.read(params, author);
    expect(current.evidence).toEqual(draftEvidence.evidence);
    expect(current.state).toBe('DRAFT');
    expect((await getQueue(reviewer)).items.some((i) => i.id === change.id)).toBe(false);
  });
  it('supports draft edits, withdrawal, rejection and cross-project isolation', async () => {
    const p = await setup();
    const other = await setup();
    const c = await draft(p);
    await expect(
      tx((db) =>
        changes.edit(db, p.id, c.id, author, {
          ...input(p),
          milestones: other.milestones,
          version: 1,
        }),
      ),
    ).rejects.toThrow('ID');
    await tx((db) =>
      changes.edit(db, p.id, c.id, teammate, { ...input(p), title: 'Better proposal', version: 1 }),
    );
    await expect(
      tx((db) => changes.act(db, other.id, c.id, reviewer, 2, 'APPROVE')),
    ).rejects.toThrow('not found');
    await submit(p.id, c.id, 2);
    await tx((db) => changes.act(db, p.id, c.id, author, 3, 'WITHDRAW'));
    expect((await projects.getProject(pool, p.id, author)).title).toBe(p.title);
    const latest = await projects.getProject(pool, p.id, author);
    const rejected = await draft(latest);
    await submit(p.id, rejected.id);
    await tx((db) =>
      changes.decide(db, p.id, rejected.id, reviewer, {
        version: 2,
        decision: 'REJECT',
        feedback: 'Keep the original scope',
      }),
    );
    expect((await projects.getProject(pool, p.id, author)).title).toBe(p.title);
    await expect(changes.list(pool, p.id, outsider)).rejects.toThrow('not found');
  });
});
