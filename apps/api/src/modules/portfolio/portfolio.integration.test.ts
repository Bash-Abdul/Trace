import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Isolated test database required');
process.env.DATABASE_URL = url;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { pool, withTransaction: tx } = await import('../../config/db.js');
const projects = await import('../projects/projects.service.js');
const repo = await import('../projects/projects.repository.js');
const milestones = await import('../milestones/milestones.service.js');
const deliverables = await import('../deliverables/deliverables.service.js');
const service = await import('../final-approval/final-approval.service.js');
const portfolio = await import('./portfolio.service.js');
const { createApp } = await import('../../app.js');
const { hashPassword } = await import('../auth/auth-crypto/auth-crypto.js');
const { login } = await import('../auth/auth.service.js');
const { cookieName } = await import('../auth/auth-policy.js');
const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const [lead, author, reviewer, outsider] = users as [string, string, string, string];
const ids: string[] = [];
let cookie: string;
beforeAll(async () => {
  const password = 'FinalApprovalPassword1!';
  const hash = await hashPassword(password);
  for (const id of users)
    await pool.query(
      'INSERT INTO users(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,now())',
      [id, `portfolio-${id}@example.com`, hash],
    );
  const session = await login(`portfolio-${lead}@example.com`, password, null);
  cookie = `${cookieName}=${session.rawToken}`;
});
beforeEach(async () => {
  await pool.query('DELETE FROM auth_rate_limits');
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM auth_audit_events WHERE user_id=ANY($1::uuid[])', [users]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
  await pool.end();
});
async function setup(ready = true, omitEvidence = false) {
  const created = await tx((db) =>
    projects.createProject(db, lead, {
      title: 'Final review test',
      description: 'A project ready for completion',
      objectives: ['Investigate'],
      projectType: 'GROUP',
      approvalRoute: 'EXTERNALLY_APPROVED',
      templateKey: 'custom',
      creatorRole: 'LEAD_AUTHOR',
      milestones: [
        {
          title: 'Research',
          required: true,
          expectedEvidence: [{ title: 'Interview notes', required: true }],
        },
      ],
      deliverables: [
        { title: 'Final report', required: true },
        { title: 'Optional appendix', required: false },
      ],
    }),
  );
  ids.push(created.id);
  await tx(async (db) => {
    await repo.addMember(db, created.id, reviewer, 'MAIN_REVIEWER');
    await repo.addMember(db, created.id, author, 'AUTHOR');
    await repo.activateExternal(db, created.id);
  });
  const p = await projects.getProject(pool, created.id, lead);
  const m = { projectId: p.id, milestoneId: p.milestones[0]!.id };
  const d = { projectId: p.id, deliverableId: p.deliverables[0]!.id };
  if (ready) {
    let detail = await tx((db) =>
      milestones.saveDraft(db, m, lead, {
        version: 0,
        evidence: [
          {
            title: 'Research',
            kind: 'TEXT',
            content: 'Research completed.',
            expectationIds: omitEvidence ? [] : [p.milestones[0]!.expectedEvidence![0]!.id],
          },
        ],
      }),
    );
    detail = await tx((db) => milestones.submit(db, m, lead, detail.version));
    await tx((db) =>
      milestones.decide(db, m, detail.submissions[0]!.id, reviewer, {
        version: detail.version,
        decision: 'APPROVE',
        feedback: '',
      }),
    );
    const draft = await tx((db) =>
      deliverables.saveDraft(db, d, author, {
        version: 0,
        kind: 'TEXT',
        content: 'The final report.',
        note: '',
      }),
    );
    await tx((db) => deliverables.submit(db, d, lead, draft.version));
  }
  return { p, m, d };
}
async function ask(projectId: string) {
  const current = await service.read(projectId, lead);
  const input = { version: current.version, key: randomUUID() };
  return { input, result: await tx((db) => service.requestApproval(db, projectId, lead, input)) };
}

describe('process portfolio', () => {
  it('returns live attributed work and all timeline events without exposing another project', async () => {
    const { p, m } = await setup();
    await tx(async (db) => {
      for (let i = 0; i < 105; i++) await repo.event(db, p.id, lead, 'PORTFOLIO_TEST', { i });
    });
    const result = await portfolio.read(p.id, reviewer);
    expect(result.mode).toBe('LIVE');
    expect(result.records.submissions[0]!.milestone_id).toBe(m.milestoneId);
    expect(result.records.deliverables[0]!.created_by).toBe(author);
    expect(result.records.events.length).toBeGreaterThan(100);
    const other = await setup();
    expect(result.records.submissions.some((v) => v.milestone_id === other.m.milestoneId)).toBe(
      false,
    );
    await expect(portfolio.read(p.id, outsider)).rejects.toMatchObject({ statusCode: 404 });
    const app = createApp();
    expect((await request(app).get(`/api/v1/projects/${p.id}/portfolio`)).status).toBe(401);
    expect(
      (await request(app).get(`/api/v1/projects/${p.id}/portfolio`).set('Cookie', cookie)).status,
    ).toBe(200);
  });
  it('renders completion from its snapshot, excluding later edits and unsubmitted drafts', async () => {
    const { p } = await setup();
    const pending = (await ask(p.id)).result.requests[0]!;
    await tx((db) =>
      service.decide(db, p.id, pending.id, reviewer, {
        key: randomUUID(),
        decision: 'APPROVE',
        feedback: 'Complete.',
      }),
    );
    const before = await portfolio.read(p.id, lead);
    expect(before.mode).toBe('FINAL');
    expect(before.drafts).toEqual([]);
    expect(before.finalRequest?.state).toBe('APPROVED');
    // Simulate future metadata updates: a final record must keep the approved values.
    await pool.query("UPDATE projects SET title='Changed outside the workflow' WHERE id=$1", [
      p.id,
    ]);
    await tx((db) => repo.event(db, p.id, lead, 'LATER_EVENT'));
    expect(await portfolio.read(p.id, lead)).toEqual(before);
    await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [
      p.id,
      author,
    ]);
    await expect(portfolio.read(p.id, author)).rejects.toMatchObject({ statusCode: 404 });
    expect(
      (await portfolio.read(p.id, reviewer)).project.members.some((m) => m.user_id === author),
    ).toBe(true);
  });
  it('rolls a captured portfolio back with completion and keeps the preview live', async () => {
    const { p } = await setup();
    const pending = (await ask(p.id)).result.requests[0]!;
    await expect(
      tx(async (db) => {
        await service.decide(db, p.id, pending.id, reviewer, {
          key: randomUUID(),
          decision: 'APPROVE',
          feedback: '',
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await portfolio.read(p.id, lead)).mode).toBe('LIVE');
  });
  it('keeps live drafts separate from immutable submissions and uses stable legacy manifest references', async () => {
    const { p, m } = await setup(false);
    await tx((db) =>
      milestones.saveDraft(db, m, author, {
        version: 0,
        evidence: [{ title: 'Draft only', kind: 'TEXT', content: 'Unsubmitted work' }],
      }),
    );
    const live = await portfolio.read(p.id, lead);
    expect(live.drafts[0]!.created_by).toBe(author);
    expect(live.records.submissions).toEqual([]);
    const ready = await setup();
    const pending = (await ask(ready.p.id)).result.requests[0]!;
    await tx((db) =>
      service.decide(db, ready.p.id, pending.id, reviewer, {
        key: randomUUID(),
        decision: 'APPROVE',
        feedback: '',
      }),
    );
    const saved = await import('./portfolio.repository.js').then((r) =>
      r.snapshot(pool, ready.p.id),
    );
    const records = (await portfolio.read(ready.p.id, lead)).records;
    const filtered = portfolio.selectLegacyRecords(saved!.manifest, {
      ...records,
      submissions: [...records.submissions, { ...records.submissions[0]!, id: randomUUID() }],
    });
    expect(filtered.submissions).toHaveLength(1);
  });
});
