import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('An isolated _test database is required');
process.env.DATABASE_URL = url;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { pool, withTransaction: tx } = await import('../../config/db.js');
const { createApp } = await import('../../app.js');
const { hashPassword } = await import('../auth/auth-crypto/auth-crypto.js');
const { login } = await import('../auth/auth.service.js');
const { cookieName } = await import('../auth/auth-policy.js');
const projects = await import('../projects/projects.service.js');
const projectRepo = await import('../projects/projects.repository.js');
const changes = await import('../changes/changes.service.js');
const members = await import('../members/members.service.js');
const service = await import('./deliverables.service.js');
const app = createApp();
const origin = 'http://localhost:3000';
const users = Array.from({ length: 4 }, () => randomUUID());
const [lead, author, reviewer, outsider] = users as [string, string, string, string];
const ids: string[] = [];
let cookie: string, csrf: string;
const sample = {
  kind: 'LINK' as const,
  content: 'https://example.com/report',
  note: 'The final report.',
};
beforeAll(async () => {
  const password = 'DeliverableTestPassword1!';
  const hash = await hashPassword(password);
  for (const id of users)
    await pool.query(
      'INSERT INTO users(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,now())',
      [id, `deliverable-${id}@example.com`, hash],
    );
  const session = await login(`deliverable-${lead}@example.com`, password, null);
  cookie = `${cookieName}=${session.rawToken}`;
  csrf = session.csrfToken;
});
beforeEach(async () => {
  await pool.query('DELETE FROM auth_rate_limits');
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM auth_audit_events WHERE user_id = ANY($1::uuid[])', [users]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
  await pool.end();
});
async function setup(group = true) {
  const p = await tx((db) =>
    projects.createProject(db, lead, {
      title: 'Final outputs',
      description: 'Testing final outputs',
      objectives: ['Explore'],
      projectType: group ? 'GROUP' : 'INDIVIDUAL',
      approvalRoute: 'EXTERNALLY_APPROVED',
      templateKey: 'custom',
      creatorRole: 'LEAD_AUTHOR',
      milestones: [{ title: 'Research', required: true }],
      deliverables: [
        { title: 'Final report', required: true },
        { title: 'Supporting notes', required: false },
      ],
    }),
  );
  ids.push(p.id);
  await tx(async (db) => {
    await projectRepo.addMember(db, p.id, reviewer, 'MAIN_REVIEWER');
    if (group) await projectRepo.addMember(db, p.id, author, 'AUTHOR');
    await projectRepo.activateExternal(db, p.id);
  });
  return projects.getProject(pool, p.id, lead);
}
const params = (p: Awaited<ReturnType<typeof setup>>) => ({
  projectId: p.id,
  deliverableId: p.deliverables[0]!.id,
});
async function applyChange(
  projectId: string,
  update: (p: Awaited<ReturnType<typeof setup>>) => object,
) {
  const p = await projects.getProject(pool, projectId, lead);
  let change = await tx((db) =>
    changes.create(db, p.id, lead, { ...p, reason: 'Agreed updated outputs', ...update(p) }),
  );
  await tx((db) => changes.act(db, p.id, change.id, lead, change.version, 'SUBMIT'));
  change = (await changes.list(pool, p.id, lead))[0]!;
  await tx((db) => changes.act(db, p.id, change.id, reviewer, change.version, 'APPROVE'));
}
describe('final deliverables', () => {
  it('supports attributed shared drafts and immutable versions without completing the project', async () => {
    const p = await setup();
    const target = params(p);
    expect((await service.read(target, reviewer)).state).toBe('NOT_STARTED');
    let detail = await tx((db) => service.saveDraft(db, target, author, { version: 0, ...sample }));
    detail = await tx((db) =>
      service.saveDraft(db, target, lead, { version: detail.version, ...sample }),
    );
    expect(detail.draft?.updated_by).toBe(author);
    await expect(tx((db) => service.submit(db, target, author, detail.version))).rejects.toThrow(
      'role',
    );
    detail = await tx((db) => service.submit(db, target, lead, detail.version));
    const original = detail.submissions[0]!;
    expect(detail.currentSubmissionId).toBe(original.id);
    expect(original.created_by).toBe(author);
    expect(original.submitted_by).toBe(lead);
    await expect(
      tx((db) => service.saveDraft(db, target, lead, { version: detail.version, ...sample })),
    ).rejects.toThrow('revision');
    detail = await tx((db) => service.revise(db, target, author, detail.version));
    expect(detail.currentSubmissionId).toBeNull();
    expect((await projects.getProject(pool, p.id, lead)).progress.deliverables[0]!.state).toBe(
      'DRAFT',
    );
    detail = await tx((db) =>
      service.saveDraft(db, target, author, {
        version: detail.version,
        kind: 'TEXT',
        content: 'Revised final output',
        note: '',
      }),
    );
    detail = await tx((db) => service.submit(db, target, lead, detail.version));
    expect(detail.submissions.map((v) => v.number)).toEqual([2, 1]);
    expect(detail.submissions[1]).toEqual(original);
    const final = await projects.getProject(pool, p.id, lead);
    expect(final.status).toBe('ACTIVE');
    expect(final.progress.deliverables[0]!.currentSubmissionId).toBe(detail.submissions[0]!.id);
    expect(final.progress.deliverables[1]!.state).toBe('NOT_STARTED');
    await expect(
      pool.query("UPDATE deliverable_submission_versions SET content = 'changed' WHERE id = $1", [
        original.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    const notices = await pool.query<{ details: { deliverableId: string; submissionId: string } }>(
      "SELECT details FROM project_notifications WHERE project_id = $1 AND recipient_id = $2 AND action = 'DELIVERABLE_SUBMITTED' ORDER BY created_at DESC",
      [p.id, reviewer],
    );
    expect(notices.rows[0]!.details).toEqual({
      deliverableId: target.deliverableId,
      submissionId: detail.submissions[0]!.id,
    });
  });
  it('enforces session, origin, CSRF and safe-link validation through HTTP', async () => {
    const p = await setup(false);
    const target = params(p);
    const path = `/api/v1/projects/${p.id}/deliverables/${target.deliverableId}`;
    expect((await request(app).get(path)).status).toBe(401);
    expect(
      (
        await request(app)
          .patch(path + '/draft')
          .set('Cookie', cookie)
          .send({ version: 0, ...sample })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(path + '/draft')
          .set('Cookie', cookie)
          .set('Origin', origin)
          .send({ version: 0, ...sample })
      ).status,
    ).toBe(403);
    const mutation = (body: object) =>
      request(app)
        .patch(path + '/draft')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body);
    expect((await mutation({ version: 0, ...sample, content: 'javascript:alert(1)' })).status).toBe(
      400,
    );
    expect((await mutation({ version: 0, ...sample, content: '' })).status).toBe(400);
    expect((await mutation({ version: 0, ...sample })).status).toBe(200);
    expect(
      (
        await request(app)
          .post(path + '/submissions')
          .set('Cookie', cookie)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ version: 1 })
      ).status,
    ).toBe(201);
  });
  it('rejects outsiders, cross-project IDs, Reviewer edits, inactive projects and removed Authors', async () => {
    const p = await setup();
    const other = await setup();
    const target = params(p);
    await expect(service.read(target, outsider)).rejects.toThrow('Project not found');
    await expect(
      service.read({ ...target, deliverableId: other.deliverables[0]!.id }, lead),
    ).rejects.toThrow('Deliverable not found');
    await expect(
      tx((db) => service.saveDraft(db, target, reviewer, { version: 0, ...sample })),
    ).rejects.toThrow('role');
    await pool.query("UPDATE projects SET status = 'SETUP' WHERE id = $1", [p.id]);
    await expect(
      tx((db) => service.saveDraft(db, target, lead, { version: 0, ...sample })),
    ).rejects.toThrow('Activate');
    await pool.query("UPDATE projects SET status = 'ACTIVE' WHERE id = $1", [p.id]);
    let detail = await tx((db) => service.saveDraft(db, target, author, { version: 0, ...sample }));
    const latest = await projects.getProject(pool, p.id, lead);
    await tx((db) =>
      members.remove(db, { projectId: p.id, userId: author }, lead, {
        version: latest.version,
        reason: 'Left group',
      }),
    );
    await expect(
      tx((db) => service.saveDraft(db, target, author, { version: detail.version, ...sample })),
    ).rejects.toThrow('Project not found');
    detail = await tx((db) => service.submit(db, target, lead, detail.version));
    expect(detail.submissions[0]!.created_by).toBe(author);
  });
  it('serializes competing edits/submissions and rolls back output, audit and notifications together', async () => {
    const p = await setup();
    const target = params(p);
    const writes = await Promise.allSettled(
      [lead, author].map((id) =>
        tx((db) => service.saveDraft(db, target, id, { version: 0, ...sample })),
      ),
    );
    expect(writes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    let detail = await service.read(target, lead);
    const before = await projects.getProject(pool, p.id, lead);
    await expect(
      tx(async (db) => {
        await service.submit(db, target, lead, detail.version);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await service.read(target, lead)).submissions).toEqual([]);
    expect((await projects.getProject(pool, p.id, lead)).version).toBe(before.version);
    expect(
      (
        await pool.query(
          "SELECT id FROM project_notifications WHERE project_id = $1 AND action = 'DELIVERABLE_SUBMITTED'",
          [p.id],
        )
      ).rowCount,
    ).toBe(0);
    const submissions = await Promise.allSettled(
      [1, 2].map(() => tx((db) => service.submit(db, target, lead, detail.version))),
    );
    expect(submissions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    detail = await service.read(target, lead);
    expect(detail.submissions).toHaveLength(1);
  });
  it('preserves IDs on reorder and invalidates changed requirements while retaining removed history', async () => {
    const p = await setup();
    const target = params(p);
    let detail = await tx((db) => service.saveDraft(db, target, lead, { version: 0, ...sample }));
    detail = await tx((db) => service.submit(db, target, lead, detail.version));
    const original = detail.submissions[0]!;
    await applyChange(p.id, (current) => ({ deliverables: [...current.deliverables].reverse() }));
    expect((await service.read(target, lead)).currentSubmissionId).toBe(original.id);
    await applyChange(p.id, (current) => ({
      deliverables: current.deliverables.map((d) =>
        d.id === target.deliverableId ? { ...d, title: 'Expanded report' } : d,
      ),
    }));
    await expect(tx((db) => service.revise(db, target, lead, detail.version))).rejects.toThrow(
      'changed',
    );
    detail = await service.read(target, lead);
    expect(detail.currentSubmissionId).toBeNull();
    expect(detail.state).toBe('DRAFT');
    expect(detail.submissions[0]!.title).toBe('Final report');
    await applyChange(p.id, (current) => ({
      deliverables: current.deliverables.filter((d) => d.id !== target.deliverableId),
    }));
    detail = await service.read(target, reviewer);
    expect(detail.deliverable.archived_at).not.toBeNull();
    expect(detail.submissions[0]).toEqual(original);
    await expect(
      tx((db) => service.saveDraft(db, target, lead, { version: detail.version, ...sample })),
    ).rejects.toThrow('removed');
    expect(
      (await projects.getProject(pool, p.id, lead)).archived_deliverables.map((d) => d.id),
    ).toContain(target.deliverableId);
  });
});
