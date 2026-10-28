import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { FinalRequest } from './final-approval.types.js';
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
const service = await import('./final-approval.service.js');
const changes = await import('../changes/changes.service.js');
const { createApp } = await import('../../app.js');
const { hashPassword } = await import('../auth/auth-crypto/auth-crypto.js');
const { login } = await import('../auth/auth.service.js');
const { cookieName } = await import('../auth/auth-policy.js');
const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const [lead, author, reviewer, outsider] = users as [string, string, string, string];
const ids: string[] = [];
let cookie: string, csrf: string;
beforeAll(async () => {
  const password = 'FinalApprovalPassword1!';
  const hash = await hashPassword(password);
  for (const id of users)
    await pool.query(
      'INSERT INTO users(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,now())',
      [id, `final-${id}@example.com`, hash],
    );
  const session = await login(`final-${lead}@example.com`, password, null);
  cookie = `${cookieName}=${session.rawToken}`;
  csrf = session.csrfToken;
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
describe('final approval and completion', () => {
  it('enforces all readiness conditions, current roles and project isolation', async () => {
    const { p } = await setup(false);
    const current = await service.read(p.id, lead);
    expect(current.eligible).toBe(false);
    expect(current.checklist.filter((c) => !c.satisfied).map((c) => c.key)).toEqual([
      'milestones',
      'deliverables',
      'evidence',
    ]);
    await expect(
      tx((db) =>
        service.requestApproval(db, p.id, lead, { version: current.version, key: randomUUID() }),
      ),
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      tx((db) =>
        service.requestApproval(db, p.id, author, { version: current.version, key: randomUUID() }),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.read(p.id, outsider)).rejects.toMatchObject({ statusCode: 404 });
    const omitted = await setup(true, true);
    expect(
      (await service.read(omitted.p.id, lead)).checklist.find((c) => c.key === 'evidence')
        ?.satisfied,
    ).toBe(false);
  });
  it('blocks on unresolved feedback and proposed changes, even after milestone approval', async () => {
    const { p, m } = await setup();
    const milestone = await milestones.read(m, reviewer);
    await tx((db) =>
      milestones.addFeedback(db, m, milestone.submissions[0]!.id, reviewer, {
        body: 'Resolve this concern.',
        blocking: true,
      }),
    );
    const current = await service.read(p.id, lead);
    expect(current.eligible).toBe(false);
    expect(current.checklist.find((c) => c.key === 'milestones')?.satisfied).toBe(true);
    const other = await setup();
    const project = await projects.getProject(pool, other.p.id, lead);
    const change = await tx((db) =>
      changes.create(db, project.id, lead, {
        ...project,
        title: 'Revised final review plan',
        reason: 'Updated plan',
      }),
    );
    await tx((db) => changes.act(db, project.id, change.id, lead, change.version, 'SUBMIT'));
    expect(
      (await service.read(project.id, lead)).checklist.find((c) => c.key === 'changes')?.satisfied,
    ).toBe(false);
  });
  it('records revisions, retries safely, completes atomically and preserves an immutable final manifest', async () => {
    const { p, d, m } = await setup();
    const first = await ask(p.id);
    const requestId = first.result.requests[0]!.id;
    const again = await tx((db) => service.requestApproval(db, p.id, lead, first.input));
    expect(again.requests).toHaveLength(1);
    const revision = {
      key: randomUUID(),
      decision: 'REQUEST_REVISION' as const,
      feedback: 'Clarify the final summary.',
    };
    await tx((db) => service.decide(db, p.id, requestId, reviewer, revision));
    expect((await tx((db) => service.decide(db, p.id, requestId, reviewer, revision))).status).toBe(
      'ACTIVE',
    );
    const second = await ask(p.id);
    const id = second.result.requests[0]!.id;
    await expect(
      tx((db) =>
        service.decide(db, p.id, requestId, reviewer, {
          key: randomUUID(),
          decision: 'APPROVE',
          feedback: '',
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    const decision = {
      key: randomUUID(),
      decision: 'APPROVE' as const,
      feedback: 'All requirements met.',
    };
    await expect(
      tx(async (db) => {
        await service.decide(db, p.id, id, reviewer, decision);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await service.read(p.id, lead)).status).toBe('FINAL_APPROVAL_PENDING');
    expect(
      (await pool.query('SELECT id FROM final_portfolio_snapshots WHERE project_id=$1', [p.id]))
        .rowCount,
    ).toBe(0);
    const completed = await tx((db) => service.decide(db, p.id, id, reviewer, decision));
    expect(completed.status).toBe('COMPLETED');
    expect((await tx((db) => service.decide(db, p.id, id, reviewer, decision))).status).toBe(
      'COMPLETED',
    );
    const snapshots = await pool.query<{ manifest: { finalRequest: FinalRequest } }>(
      'SELECT * FROM final_portfolio_snapshots WHERE project_id=$1',
      [p.id],
    );
    expect(snapshots.rowCount).toBe(1);
    expect(snapshots.rows[0]!.manifest.finalRequest.state).toBe('APPROVED');
    expect(snapshots.rows[0]!.manifest.finalRequest.snapshot.deliverableVersions).toHaveLength(1);
    await expect(
      pool.query("UPDATE final_portfolio_snapshots SET manifest='{}' WHERE project_id=$1", [p.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query("UPDATE final_approval_requests SET snapshot='{}' WHERE id=$1", [id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(tx((db) => deliverables.revise(db, d, lead, 2))).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      tx((db) => milestones.saveDraft(db, m, lead, { version: 3, evidence: [] })),
    ).rejects.toMatchObject({ statusCode: 422 });
    const events = await pool.query(
      "SELECT id FROM project_events WHERE project_id=$1 AND action='PROJECT_COMPLETED'",
      [p.id],
    );
    expect(events.rowCount).toBe(1);
  });
  it('invalidates pending requests when a deliverable or feedback changes', async () => {
    const { p, d, m } = await setup();
    await ask(p.id);
    const draft = await deliverables.read(d, lead);
    await tx((db) => deliverables.revise(db, d, author, draft.version));
    let current = await service.read(p.id, lead);
    expect(current.status).toBe('ACTIVE');
    expect(current.requests[0]!.state).toBe('INVALIDATED');
    const revision = await deliverables.read(d, lead);
    await tx((db) => deliverables.submit(db, d, lead, revision.version));
    await ask(p.id);
    const milestone = await milestones.read(m, reviewer);
    await tx((db) =>
      milestones.addFeedback(db, m, milestone.submissions[0]!.id, reviewer, {
        body: 'A new blocking concern.',
        blocking: true,
      }),
    );
    current = await service.read(p.id, lead);
    expect(current.requests[0]!.state).toBe('INVALIDATED');
    expect(current.eligible).toBe(false);
  });
  it('serializes competing requests and approval versus revision without stale completion', async () => {
    const { p, d } = await setup();
    const current = await service.read(p.id, lead);
    const competing = await Promise.allSettled(
      [1, 2].map(() =>
        tx((db) =>
          service.requestApproval(db, p.id, lead, { version: current.version, key: randomUUID() }),
        ),
      ),
    );
    expect(competing.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const pending = (await service.read(p.id, lead)).requests[0]!;
    const draft = await deliverables.read(d, lead);
    await Promise.allSettled([
      tx((db) =>
        service.decide(db, p.id, pending.id, reviewer, {
          key: randomUUID(),
          decision: 'APPROVE',
          feedback: '',
        }),
      ),
      tx((db) => deliverables.revise(db, d, author, draft.version)),
    ]);
    const final = await service.read(p.id, lead);
    const submitted = (await deliverables.read(d, lead)).state === 'SUBMITTED';
    const count = (
      await pool.query('SELECT id FROM final_portfolio_snapshots WHERE project_id=$1', [p.id])
    ).rowCount;
    if (final.status === 'COMPLETED') {
      expect(submitted).toBe(true);
      expect(count).toBe(1);
    } else {
      expect(final.status).toBe('ACTIVE');
      expect(final.requests[0]!.state).toBe('INVALIDATED');
      expect(count).toBe(0);
    }
  });
  it('rejects a former main Reviewer and invalidates a snapshot tied to changed review authority', async () => {
    const { p } = await setup();
    const pending = (await ask(p.id)).result.requests[0]!;
    await tx(async (db) => {
      await repo.findMemberProjectForUpdate(db, p.id, lead);
      await db.query(
        "UPDATE project_memberships SET role='DORMANT_REVIEWER' WHERE project_id=$1 AND user_id=$2",
        [p.id, reviewer],
      );
      await repo.addMember(db, p.id, outsider, 'MAIN_REVIEWER');
    });
    const decision = { key: randomUUID(), decision: 'APPROVE' as const, feedback: '' };
    await expect(
      tx((db) => service.decide(db, p.id, pending.id, reviewer, decision)),
    ).rejects.toMatchObject({ statusCode: 403 });
    const result = await tx((db) => service.decide(db, p.id, pending.id, outsider, decision));
    expect(result.status).toBe('ACTIVE');
    expect(result.requests[0]!.state).toBe('INVALIDATED');
    expect(
      (await pool.query('SELECT id FROM final_portfolio_snapshots WHERE project_id=$1', [p.id]))
        .rowCount,
    ).toBe(0);
  });
  it('protects HTTP writes with session, origin, CSRF and validation; supports withdrawal', async () => {
    const { p } = await setup();
    const app = createApp();
    const path = `/api/v1/projects/${p.id}/final-approval`;
    const current = await service.read(p.id, lead);
    const body = { version: current.version, key: randomUUID() };
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).post(path).set('Cookie', cookie).send(body)).status).toBe(403);
    expect(
      (
        await request(app)
          .post(path)
          .set('Cookie', cookie)
          .set('Origin', 'http://localhost:3000')
          .send(body)
      ).status,
    ).toBe(403);
    const post = (value: unknown) =>
      request(app)
        .post(path)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrf)
        .send(value as object);
    expect((await post({ ...body, key: 'bad' })).status).toBe(400);
    const response = await post(body);
    expect(response.status, response.text).toBe(201);
    const id = (response.body as { requests: { id: string }[] }).requests[0]!.id;
    expect((await tx((db) => service.withdraw(db, p.id, id, lead))).status).toBe('ACTIVE');
    expect((await tx((db) => service.withdraw(db, p.id, id, lead))).requests[0]!.state).toBe(
      'WITHDRAWN',
    );
    const other = await setup();
    await expect(
      tx((db) =>
        service.decide(db, other.p.id, id, reviewer, {
          key: randomUUID(),
          decision: 'APPROVE',
          feedback: '',
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
