import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('An isolated _test database is required');
process.env.DATABASE_URL = testUrl;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { createApp } = await import('../../app.js');
const { pool, withTransaction } = await import('../../config/db.js');
const { login } = await import('../auth/auth.service.js');
const { hashPassword } = await import('../auth/auth-crypto/auth-crypto.js');
const { cookieName } = await import('../auth/auth-policy.js');
const app = createApp();
const origin = 'http://localhost:3000';
const evidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(['TEXT', 'LINK']),
  title: z.string(),
  content: z.string(),
  created_by: z.string(),
  updated_by: z.string(),
});
const detailSchema = z.object({
  version: z.number(),
  state: z.string(),
  evidence: z.array(evidenceSchema),
  submissions: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      evidence: z.array(evidenceSchema),
      decision: z.string().nullable(),
    }),
  ),
  feedback: z.array(
    z.object({ id: z.string(), version: z.number(), state: z.string(), blocking: z.boolean() }),
  ),
  messages: z.array(z.object({ body: z.string() })),
});
type Actor = { id: string; cookie: string; csrf: string };
const actors: Actor[] = [];
const projectIds: string[] = [];
let lead: Actor, author: Actor, reviewer: Actor, dormant: Actor, outsider: Actor;
let projectId: string, milestoneId: string, otherMilestoneId: string;
const sample = {
  title: 'Research notes',
  kind: 'TEXT',
  content: 'What we learned from the interviews.',
};

beforeAll(async () => {
  const hash = await hashPassword('MilestonePassword1!');
  for (let i = 0; i < 5; i++) {
    const email = `milestone-${randomUUID()}@example.com`;
    const result = await pool.query<{ id: string }>(
      'INSERT INTO users (email, password_hash, email_verified_at) VALUES ($1, $2, now()) RETURNING id',
      [email, hash],
    );
    const session = await login(email, 'MilestonePassword1!', null);
    actors.push({
      id: result.rows[0]!.id,
      cookie: `${cookieName}=${session.rawToken}`,
      csrf: session.csrfToken,
    });
  }
  [lead, author, reviewer, dormant, outsider] = actors as [Actor, Actor, Actor, Actor, Actor];
});
beforeEach(async () => {
  await pool.query('DELETE FROM auth_rate_limits');
  await pool.query('DELETE FROM project_notifications WHERE project_id = ANY($1::uuid[])', [
    projectIds,
  ]);
  projectId = randomUUID();
  milestoneId = randomUUID();
  otherMilestoneId = randomUUID();
  projectIds.push(projectId);
  await pool.query(
    `INSERT INTO projects (id, created_by_user_id, project_type, approval_route, title, description, template_key, status)
    VALUES ($1, $2, 'GROUP', 'IN_PLATFORM_PROPOSAL', 'Milestone test', 'Test project', 'design', 'ACTIVE')`,
    [projectId, lead.id],
  );
  for (const [actor, role] of [
    [lead, 'LEAD_AUTHOR'],
    [author, 'AUTHOR'],
    [reviewer, 'MAIN_REVIEWER'],
    [dormant, 'DORMANT_REVIEWER'],
  ] as const) {
    await pool.query(
      'INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)',
      [projectId, actor.id, role],
    );
  }
  await pool.query(
    `INSERT INTO project_milestones (id, project_id, position, title)
    VALUES ($1, $3, 0, 'Research'), ($2, $3, 1, 'Development')`,
    [milestoneId, otherMilestoneId, projectId],
  );
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
  await pool.query('DELETE FROM auth_audit_events WHERE user_id = ANY($1::uuid[])', [
    actors.map((actor) => actor.id),
  ]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [
    actors.map((actor) => actor.id),
  ]);
  await pool.query('DELETE FROM auth_rate_limits');
  await pool.end();
});
function path(milestone = milestoneId) {
  return `/api/v1/projects/${projectId}/milestones/${milestone}`;
}
function mutation(actor: Actor, suffix: string, body: object, milestone = milestoneId) {
  const call =
    suffix === '/draft' || suffix.startsWith('/feedback/')
      ? request(app).patch(path(milestone) + suffix)
      : request(app).post(path(milestone) + suffix);
  return call
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', actor.csrf)
    .send(body);
}
async function read(actor = lead) {
  const response = await request(app).get(path()).set('Cookie', actor.cookie);
  expect(response.status).toBe(200);
  return detailSchema.parse(response.body);
}
async function draft() {
  const response = await mutation(author, '/draft', { version: 0, evidence: [sample] });
  expect(response.status).toBe(200);
  return detailSchema.parse(response.body);
}
async function submitted() {
  const saved = await draft();
  const response = await mutation(lead, '/submissions', { version: saved.version });
  expect(response.status).toBe(201);
  return detailSchema.parse(response.body);
}

const inboxSchema = z.object({
  unread_count: z.number(),
  next_cursor: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      project_id: z.string(),
      milestone_id: z.string().nullable(),
      read_at: z.string().nullable(),
      details: z.record(z.string(), z.unknown()),
    }),
  ),
});
const inboxPath = '/api/v1/projects/notifications';
async function inbox(actor: Actor, before?: string) {
  const response = await request(app)
    .get(inboxPath + (before ? `?before=${before}` : ''))
    .set('Cookie', actor.cookie);
  expect(response.status).toBe(200);
  return inboxSchema.parse(response.body);
}
function mark(actor: Actor, id: string, read = true) {
  return request(app)
    .patch(`${inboxPath}/${id}`)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', actor.csrf)
    .send({ read });
}
describe('notification inbox', () => {
  it('persists milestone updates, protects recipients and enforces origin and CSRF', async () => {
    const current = await submitted();
    const received = await inbox(reviewer);
    expect(received.unread_count).toBe(1);
    expect(received.items[0]).toMatchObject({
      action: 'MILESTONE_SUBMITTED',
      milestone_id: milestoneId,
      read_at: null,
    });
    const id = received.items[0]!.id;
    expect((await inbox(lead)).items).toEqual([]);
    expect((await inbox(outsider)).items).toEqual([]);
    expect((await inbox(dormant)).items).toEqual([]);
    expect((await request(app).get(inboxPath)).status).toBe(401);
    expect((await mark(outsider, id)).status).toBe(404);
    expect(
      (
        await request(app)
          .patch(`${inboxPath}/${id}`)
          .set('Cookie', reviewer.cookie)
          .set('Origin', origin)
          .send({ read: true })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`${inboxPath}/${id}`)
          .set('Cookie', reviewer.cookie)
          .set('Origin', 'https://evil.example')
          .set('x-csrf-token', reviewer.csrf)
          .send({ read: true })
      ).status,
    ).toBe(403);
    expect((await mark(reviewer, id)).status).toBe(204);
    expect((await mark(reviewer, id)).status).toBe(204);
    expect((await inbox(reviewer)).unread_count).toBe(0);
    expect((await mark(reviewer, id, false)).status).toBe(204);
    expect((await inbox(reviewer)).unread_count).toBe(1);
    const submission = current.submissions[0]!;
    expect(
      (
        await mutation(reviewer, `/submissions/${submission.id}/feedback`, {
          body: 'Explain your source.',
          blocking: true,
        })
      ).status,
    ).toBe(201);
    const feedback = (await read()).feedback[0]!;
    expect(
      (
        await mutation(author, `/feedback/${feedback.id}`, {
          version: feedback.version,
          action: 'ADDRESS',
          body: 'Source added.',
        })
      ).status,
    ).toBe(200);
    expect((await inbox(reviewer)).items[0]).toMatchObject({
      action: 'MILESTONE_FEEDBACK_UPDATED',
      details: { feedbackId: feedback.id, action: 'ADDRESS' },
    });
    expect((await inbox(author)).items[0]?.action).toBe('MILESTONE_FEEDBACK_CREATED');
    await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [
      projectId,
      reviewer.id,
    ]);
    expect((await inbox(reviewer)).unread_count).toBe(0);
    expect((await mark(reviewer, id)).status).toBe(404);
  });
  it('pages deterministically and marks all recipient notifications without touching others', async () => {
    await pool.query(
      `INSERT INTO project_notifications (project_id, milestone_id, recipient_id, action, created_at)
      SELECT $1, $2, $3, 'MILESTONE_SUBMITTED', '2026-10-24T12:00:00Z'::timestamptz FROM generate_series(1, 53)`,
      [projectId, milestoneId, reviewer.id],
    );
    await pool.query(
      `INSERT INTO project_notifications (project_id, milestone_id, recipient_id, action) VALUES ($1,$2,$3,'MILESTONE_REVIEWED')`,
      [projectId, milestoneId, author.id],
    );
    const first = await inbox(reviewer);
    expect(first.items).toHaveLength(50);
    expect(first.unread_count).toBe(53);
    const second = await inbox(reviewer, first.next_cursor!);
    expect(second.items).toHaveLength(3);
    expect(second.next_cursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(53);
    expect((await inbox(author, first.next_cursor!)).items).toEqual([]);
    expect(
      (
        await request(app)
          .post(`${inboxPath}/read-all`)
          .set('Cookie', reviewer.cookie)
          .set('Origin', origin)
          .set('x-csrf-token', reviewer.csrf)
          .send({})
      ).status,
    ).toBe(204);
    expect((await inbox(reviewer)).unread_count).toBe(0);
    expect((await inbox(author)).unread_count).toBe(1);
    await pool.query(
      `UPDATE project_memberships SET role='DORMANT_REVIEWER' WHERE project_id=$1 AND user_id=$2`,
      [projectId, author.id],
    );
    expect((await inbox(author)).items).toEqual([]);
  });
  it('emits proposal notifications only on committed successful transitions', async () => {
    await pool.query(`UPDATE projects SET status='SETUP' WHERE id=$1`, [projectId]);
    const submitted = await request(app)
      .post(`/api/v1/projects/${projectId}/proposals`)
      .set('Cookie', lead.cookie)
      .set('Origin', origin)
      .set('x-csrf-token', lead.csrf)
      .send({ version: 1 });
    expect(submitted.status).toBe(201);
    expect((await inbox(reviewer)).items[0]).toMatchObject({
      action: 'PROPOSAL_SUBMITTED',
      milestone_id: null,
    });
    const project = z
      .object({ version: z.number(), proposals: z.array(z.object({ id: z.string() })) })
      .parse(submitted.body);
    const decide = () =>
      request(app)
        .post(`/api/v1/projects/${projectId}/proposals/${project.proposals[0]!.id}/decision`)
        .set('Cookie', reviewer.cookie)
        .set('Origin', origin)
        .set('x-csrf-token', reviewer.csrf)
        .send({ version: project.version, decision: 'APPROVE', feedback: '' });
    expect((await decide()).status).toBe(200);
    expect((await decide()).status).toBe(409);
    expect((await inbox(lead)).items).toHaveLength(1);
    expect((await inbox(author)).items[0]).toMatchObject({
      action: 'PROPOSAL_DECIDED',
      details: { decision: 'APPROVE' },
    });
    const { enqueue } = await import('./notifications.repository.js');
    await expect(
      withTransaction(async (client) => {
        await enqueue(client, projectId, lead.id, 'PROPOSAL_SUBMITTED', ['MAIN_REVIEWER']);
        throw new Error('Rollback fixture');
      }),
    ).rejects.toThrow('Rollback fixture');
    expect((await inbox(reviewer)).items).toHaveLength(1);
    const legacy = await request(app)
      .get(`/api/v1/projects/${projectId}/notifications`)
      .set('Cookie', reviewer.cookie);
    expect(legacy.body).toEqual([]);
  });
});
