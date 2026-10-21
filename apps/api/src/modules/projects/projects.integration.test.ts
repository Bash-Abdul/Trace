import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('Project tests require an isolated _test database');
process.env.DATABASE_URL = testUrl;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { createApp } = await import('../../app.js');
const { pool } = await import('../../config/db.js');
const { hashPassword } = await import('../auth/auth-crypto/auth-crypto.js');
const { login } = await import('../auth/auth.service.js');
const { cookieName } = await import('../auth/auth-policy.js');
const app = createApp();
const origin = 'http://localhost:3000';
const password = 'ProjectTestPassword1!';
type Actor = { id: string; email: string; cookie: string; csrf: string };
const actors: Actor[] = [];
const projectIds: string[] = [];
const projectSchema = z.object({
  id: z.string(),
  version: z.number(),
  status: z.string(),
  role: z.string(),
  title: z.string(),
  description: z.string(),
  objectives: z.array(z.string()),
  milestones: z.array(z.object({ title: z.string(), required: z.boolean() })),
  deliverables: z.array(z.object({ title: z.string(), required: z.boolean() })),
  members: z.array(z.object({ user_id: z.string(), role: z.string() })),
  proposals: z.array(
    z.object({ id: z.string(), version: z.number(), structure: z.object({ title: z.string() }) }),
  ),
});
const invitationSchema = z.object({ id: z.string(), invitationUrl: z.string() });
let author: Actor, reviewer: Actor, teammate: Actor, outsider: Actor;
beforeAll(async () => {
  const hash = await hashPassword(password);
  for (let i = 0; i < 4; i++) {
    const email = `projects-${randomUUID()}@example.com`;
    const result = await pool.query<{ id: string }>(
      'INSERT INTO users(email,password_hash,email_verified_at) VALUES($1,$2,now()) RETURNING id',
      [email, hash],
    );
    const signed = await login(email, password, null);
    actors.push({
      id: result.rows[0]!.id,
      email,
      cookie: `${cookieName}=${signed.rawToken}`,
      csrf: signed.csrfToken,
    });
  }
  [author, reviewer, teammate, outsider] = actors as [Actor, Actor, Actor, Actor];
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id=ANY($1::uuid[])', [projectIds]);
  await pool.query('DELETE FROM auth_audit_events WHERE user_id=ANY($1::uuid[])', [
    actors.map((a) => a.id),
  ]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [actors.map((a) => a.id)]);
  await pool.end();
});
function post(actor: Actor, path: string, body: object) {
  return request(app)
    .post(`/api/v1/projects${path}`)
    .set('Cookie', actor.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', actor.csrf)
    .send(body);
}
async function create(
  actor = author,
  group = false,
  external = false,
  creatorRole = 'LEAD_AUTHOR',
) {
  const response = await post(actor, '', {
    title: 'A project with real participants',
    description: 'Investigate and record a thoughtful outcome.',
    objectives: ['Explain the outcome'],
    projectType: group ? 'GROUP' : 'INDIVIDUAL',
    approvalRoute: external ? 'EXTERNALLY_APPROVED' : 'IN_PLATFORM_PROPOSAL',
    templateKey: 'design',
    creatorRole,
  });
  expect(response.status).toBe(201);
  const project = projectSchema.parse(response.body);
  projectIds.push(project.id);
  return project;
}
async function get(actor: Actor, id: string) {
  const response = await request(app).get(`/api/v1/projects/${id}`).set('Cookie', actor.cookie);
  expect(response.status).toBe(200);
  return projectSchema.parse(response.body);
}
async function invite(actor: Actor, id: string, email: string, role: string) {
  const response = await post(actor, `/${id}/invitations`, { email, role });
  expect(response.status).toBe(201);
  const invitation = invitationSchema.parse(response.body);
  return {
    ...invitation,
    token: new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get('token')!,
  };
}
async function join(actor: Actor, id: string, target: Actor, role: string) {
  const invitation = await invite(actor, id, target.email, role);
  expect((await post(target, '/invitations/accept', { token: invitation.token })).status).toBe(200);
  return invitation;
}
describe('project membership, invitations and activation', () => {
  it('requires sessions, positive origin and CSRF; hides projects from outsiders', async () => {
    const project = await create();
    expect((await request(app).get('/api/v1/projects')).status).toBe(401);
    expect(
      (await request(app).get(`/api/v1/projects/${project.id}`).set('Cookie', outsider.cookie))
        .status,
    ).toBe(404);
    expect(
      (
        await post(outsider, `/${project.id}/invitations`, {
          email: teammate.email,
          role: 'MAIN_REVIEWER',
        })
      ).status,
    ).toBe(404);
    const listed = await request(app).get('/api/v1/projects').set('Cookie', outsider.cookie);
    expect(z.object({ projects: z.array(z.unknown()) }).parse(listed.body).projects).toEqual([]);
    expect(
      (
        await request(app)
          .post(`/api/v1/projects/${project.id}/proposals`)
          .set('Cookie', author.cookie)
          .set('Origin', origin)
          .send({ version: project.version })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/projects/${project.id}/proposals`)
          .set('Cookie', author.cookie)
          .set('x-csrf-token', author.csrf)
          .send({ version: project.version })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/projects/${project.id}/proposals`)
          .set('Cookie', author.cookie)
          .set('Origin', 'https://untrusted.example')
          .set('x-csrf-token', author.csrf)
          .send({ version: project.version })
      ).status,
    ).toBe(403);
  });
  it('individual projects only permit a Reviewer invitation and cannot self-review', async () => {
    const p = await create();
    expect(
      (await post(author, `/${p.id}/invitations`, { email: teammate.email, role: 'AUTHOR' }))
        .status,
    ).toBe(403);
    expect(
      (await post(author, `/${p.id}/invitations`, { email: author.email, role: 'MAIN_REVIEWER' }))
        .status,
    ).toBe(409);
    await expect(
      pool.query(
        "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'AUTHOR')",
        [p.id, teammate.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    expect((await post(author, `/${p.id}/proposals`, { version: p.version })).status).toBe(409);
  });
  it('binds tokens to verified email, stores only a hash, and accepts once under concurrency', async () => {
    const p = await create(author, true);
    const invitation = await invite(author, p.id, teammate.email, 'AUTHOR');
    const stored = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM project_invitations WHERE id=$1',
      [invitation.id],
    );
    expect(stored.rows[0]!.token_hash).not.toBe(invitation.token);
    expect((await post(outsider, '/invitations/accept', { token: invitation.token })).status).toBe(
      403,
    );
    const results = await Promise.all([
      post(teammate, '/invitations/accept', { token: invitation.token }),
      post(teammate, '/invitations/accept', { token: invitation.token }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await get(teammate, p.id)).role).toBe('AUTHOR');
    expect(
      (
        await post(teammate, `/${p.id}/invitations`, {
          email: reviewer.email,
          role: 'MAIN_REVIEWER',
        })
      ).status,
    ).toBe(403);
    expect(
      (await post(teammate, `/${p.id}/proposals`, { version: (await get(teammate, p.id)).version }))
        .status,
    ).toBe(403);
  });
  it('reissue, expiry and cancellation invalidate tokens', async () => {
    const p = await create(author, true);
    const first = await invite(author, p.id, teammate.email, 'AUTHOR');
    const second = await invite(author, p.id, teammate.email, 'AUTHOR');
    expect((await post(teammate, '/invitations/accept', { token: first.token })).status).toBe(400);
    await pool.query(
      "UPDATE project_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
      [second.id],
    );
    expect((await post(teammate, '/invitations/accept', { token: second.token })).status).toBe(400);
    const third = await invite(author, p.id, teammate.email, 'AUTHOR');
    expect(
      (
        await request(app)
          .delete(`/api/v1/projects/${p.id}/invitations/${third.id}`)
          .set('Cookie', author.cookie)
          .set('Origin', origin)
          .set('x-csrf-token', author.csrf)
      ).status,
    ).toBe(204);
    expect((await post(teammate, '/invitations/accept', { token: third.token })).status).toBe(400);
  });
  it('permits only one pending and accepted main Reviewer', async () => {
    const p = await create(author, true);
    const responses = await Promise.all([
      post(author, `/${p.id}/invitations`, { email: reviewer.email, role: 'MAIN_REVIEWER' }),
      post(author, `/${p.id}/invitations`, { email: outsider.email, role: 'MAIN_REVIEWER' }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const index = responses.findIndex((r) => r.status === 201);
    const token = new URLSearchParams(
      new URL(invitationSchema.parse(responses[index]!.body).invitationUrl).hash.slice(1),
    ).get('token');
    expect(
      (await post(index === 0 ? reviewer : outsider, '/invitations/accept', { token })).status,
    ).toBe(200);
    expect(
      (await post(author, `/${p.id}/invitations`, { email: teammate.email, role: 'MAIN_REVIEWER' }))
        .status,
    ).toBe(409);
  });
  it('activates external projects when both roles join, including Reviewer-created projects', async () => {
    const p = await create(reviewer, true, true, 'MAIN_REVIEWER');
    expect(p.status).toBe('SETUP');
    await join(reviewer, p.id, author, 'LEAD_AUTHOR');
    expect((await get(author, p.id)).status).toBe('ACTIVE');
    expect(
      (await post(author, `/${p.id}/proposals`, { version: (await get(author, p.id)).version }))
        .status,
    ).toBe(409);
    await join(author, p.id, teammate, 'AUTHOR');
    expect((await get(teammate, p.id)).status).toBe('ACTIVE');
  });
  it('supports group draft edits, freezes proposal snapshots, rejects stale review and activates on approval', async () => {
    const p = await create(author, true);
    await join(author, p.id, teammate, 'AUTHOR');
    await join(author, p.id, reviewer, 'MAIN_REVIEWER');
    let current = await get(author, p.id);
    const draft = {
      version: current.version,
      title: 'A shared draft',
      description: current.description,
      objectives: current.objectives,
      milestones: current.milestones,
      deliverables: current.deliverables,
    };
    const patch = (actor: Actor, body: object) =>
      request(app)
        .patch(`/api/v1/projects/${p.id}`)
        .set('Cookie', actor.cookie)
        .set('Origin', origin)
        .set('x-csrf-token', actor.csrf)
        .send(body);
    expect((await patch(teammate, draft)).status).toBe(200);
    expect((await patch(author, draft)).status).toBe(409);
    current = await get(author, p.id);
    expect((await post(author, `/${p.id}/proposals`, { version: current.version })).status).toBe(
      201,
    );
    current = await get(reviewer, p.id);
    expect((await patch(author, { ...draft, version: current.version })).status).toBe(409);
    let proposalId = current.proposals[0]!.id;
    expect(
      (
        await post(author, `/${p.id}/proposals/${proposalId}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(reviewer, `/${p.id}/proposals/${proposalId}/decision`, {
          version: current.version - 1,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(reviewer, `/${p.id}/proposals/${proposalId}/decision`, {
          version: current.version,
          decision: 'REQUEST_CHANGES',
          feedback: 'Clarify the title.',
        })
      ).status,
    ).toBe(200);
    current = await get(author, p.id);
    expect(
      (await patch(teammate, { ...draft, version: current.version, title: 'A clarified project' }))
        .status,
    ).toBe(200);
    current = await get(author, p.id);
    expect(current.proposals[0]!.structure.title).toBe('A shared draft');
    expect((await post(author, `/${p.id}/proposals`, { version: current.version })).status).toBe(
      201,
    );
    current = await get(reviewer, p.id);
    expect(
      (
        await post(reviewer, `/${p.id}/proposals/${proposalId}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(409);
    proposalId = current.proposals[0]!.id;
    expect(
      (
        await post(reviewer, `/${p.id}/proposals/${proposalId}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: 'Ready.',
        })
      ).status,
    ).toBe(200);
    expect((await get(author, p.id)).status).toBe('ACTIVE');
  });
  it('keeps rejection terminal and prevents project type/route changes', async () => {
    const p = await create();
    await join(author, p.id, reviewer, 'MAIN_REVIEWER');
    let current = await get(author, p.id);
    await post(author, `/${p.id}/proposals`, { version: current.version });
    current = await get(reviewer, p.id);
    expect(
      (
        await post(reviewer, `/${p.id}/proposals/${current.proposals[0]!.id}/decision`, {
          version: current.version,
          decision: 'REJECT',
          feedback: 'Out of scope.',
        })
      ).status,
    ).toBe(200);
    current = await get(author, p.id);
    expect((await post(author, `/${p.id}/proposals`, { version: current.version })).status).toBe(
      409,
    );
    expect(
      (
        await request(app)
          .patch(`/api/v1/projects/${p.id}`)
          .set('Cookie', author.cookie)
          .set('Origin', origin)
          .set('x-csrf-token', author.csrf)
          .send({ ...current, projectType: 'GROUP' })
      ).status,
    ).toBe(400);
  });
});
