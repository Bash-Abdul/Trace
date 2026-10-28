import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('Project tests require an isolated _test database');
process.env.DATABASE_URL = testUrl;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { createApp } = await import('../../app.js');
const { pool } = await import('../../config/db.js');
const { hashPassword } = await import('../auth/auth-crypto/auth-crypto.js');
const { login, withSession } = await import('../auth/auth.service.js');
const { cookieName, readSessionCookie } = await import('../auth/auth-policy.js');
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
beforeEach(async () => {
  await pool.query('DELETE FROM auth_rate_limits');
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id=ANY($1::uuid[])', [projectIds]);
  await pool.query('DELETE FROM auth_audit_events WHERE user_id=ANY($1::uuid[])', [
    actors.map((a) => a.id),
  ]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [actors.map((a) => a.id)]);
  await pool.query('DELETE FROM auth_rate_limits');
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

describe('refactored project transaction and persistence behavior', () => {
  function patch(id: string, body: object) {
    return request(app)
      .patch(`/api/v1/projects/${id}`)
      .set('Cookie', author.cookie)
      .set('Origin', origin)
      .set('x-csrf-token', author.csrf)
      .send(body);
  }
  const itemsSchema = z.array(
    z.object({ id: z.string(), title: z.string(), required: z.boolean() }),
  );
  async function items(id: string) {
    const response = await request(app).get(`/api/v1/projects/${id}`).set('Cookie', author.cookie);
    expect(response.status).toBe(200);
    return z.object({ milestones: itemsSchema, deliverables: itemsSchema }).parse(response.body);
  }
  it('retains identifiers for legacy edits and explicit reorders; rejects foreign or duplicate IDs', async () => {
    const p = await create();
    const before = await items(p.id);
    const draft = {
      version: p.version,
      title: 'Updated title',
      description: p.description,
      objectives: p.objectives,
      milestones: p.milestones,
      deliverables: p.deliverables,
    };
    expect((await patch(p.id, draft)).status).toBe(200);
    expect(await items(p.id)).toEqual(before);
    const current = await get(author, p.id);
    const reversed = [...before.milestones].reverse();
    expect(
      (await patch(p.id, { ...draft, version: current.version, milestones: reversed })).status,
    ).toBe(200);
    expect((await items(p.id)).milestones).toEqual(reversed);
    const version = (await get(author, p.id)).version;
    const duplicate = reversed.map((item) => ({ ...item, id: reversed[0]?.id }));
    expect((await patch(p.id, { ...draft, version, milestones: duplicate })).status).toBe(400);
    expect(
      (
        await patch(p.id, {
          ...draft,
          version,
          milestones: [{ id: randomUUID(), title: 'Foreign', required: true }],
        })
      ).status,
    ).toBe(400);
    expect((await get(author, p.id)).version).toBe(version);
    expect((await items(p.id)).milestones).toEqual(reversed);
    const shortened = reversed.slice(0, 2);
    expect(
      (
        await patch(p.id, {
          ...draft,
          version,
          milestones: [...shortened, { title: 'New milestone', required: true }],
        })
      ).status,
    ).toBe(200);
    const updated = await items(p.id);
    expect(updated.milestones.slice(0, 2)).toEqual(shortened);
    expect(updated.milestones).toHaveLength(3);
    expect(before.milestones.map((item) => item.id)).not.toContain(updated.milestones[2]?.id);
  });
  it('rolls back brief, structure, version and events together when protected work fails', async () => {
    const p = await create();
    const before = await items(p.id);
    const { updateDraft } = await import('./projects.service.js');
    const priorEvents = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM project_events WHERE project_id=$1',
      [p.id],
    );
    await expect(
      withSession(readSessionCookie(author.cookie), author.csrf, async (client) => {
        await updateDraft(client, p.id, author.id, {
          version: p.version,
          title: 'Must roll back',
          description: p.description,
          objectives: ['Must roll back'],
          milestones: [{ ...before.milestones[0]!, title: 'Changed', required: true }],
          deliverables: p.deliverables,
        });
        throw new Error('simulate a later operation failure');
      }),
    ).rejects.toThrow('simulate a later operation failure');
    expect(await get(author, p.id)).toMatchObject({
      title: p.title,
      version: p.version,
      objectives: p.objectives,
    });
    expect(await items(p.id)).toEqual(before);
    const afterEvents = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM project_events WHERE project_id=$1',
      [p.id],
    );
    expect(afterEvents.rows).toEqual(priorEvents.rows);
  });
  it('reads committed project details without waiting for another request’s project lock', async () => {
    const p = await create();
    const blocker = await pool.connect();
    let pending: Promise<request.Response> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('UPDATE projects SET title=$2 WHERE id=$1', [p.id, 'Uncommitted title']);
      pending = request(app)
        .get(`/api/v1/projects/${p.id}`)
        .set('Cookie', author.cookie)
        .then((result) => result);
      const result = await Promise.race([
        pending,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 1500);
        }),
      ]);
      expect(result?.status).toBe(200);
      expect(projectSchema.parse(result?.body).title).toBe(p.title);
    } finally {
      if (timer) clearTimeout(timer);
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
  });
  it('rejects revoked and expired sessions on reads and mutations', async () => {
    const p = await create();
    for (const mode of ['revoked', 'expired']) {
      const signed = await login(author.email, password, null);
      if (mode === 'revoked')
        await pool.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [
          signed.sessionId,
        ]);
      else
        await pool.query(
          "UPDATE auth_sessions SET idle_expires_at=now()-interval '1 second' WHERE id=$1",
          [signed.sessionId],
        );
      const cookie = `${cookieName}=${signed.rawToken}`;
      expect(
        (await request(app).get(`/api/v1/projects/${p.id}`).set('Cookie', cookie)).status,
      ).toBe(401);
      expect(
        (
          await request(app)
            .post(`/api/v1/projects/${p.id}/proposals`)
            .set('Cookie', cookie)
            .set('Origin', origin)
            .set('x-csrf-token', signed.csrfToken)
            .send({ version: p.version })
        ).status,
      ).toBe(401);
    }
  });
  it('enforces project provenance and proposal immutability in PostgreSQL', async () => {
    const p = await create();
    await expect(
      pool.query("UPDATE projects SET project_type='GROUP' WHERE id=$1", [p.id]),
    ).rejects.toMatchObject({ code: '23514' });
    await join(author, p.id, reviewer, 'MAIN_REVIEWER');
    const current = await get(author, p.id);
    expect((await post(author, `/${p.id}/proposals`, { version: current.version })).status).toBe(
      201,
    );
    await expect(
      pool.query("UPDATE project_proposals SET structure='{}'::jsonb WHERE project_id=$1", [p.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('keeps legacy IDs attached to titles through deletion, insertion and reordering', async () => {
    const p = await create();
    const original = (await items(p.id)).milestones;
    let current = await get(author, p.id);
    let expected = original.slice(1);
    const saveLegacy = async (milestones: { title: string; required: boolean }[]) => {
      const response = await patch(p.id, {
        version: current.version,
        title: current.title,
        description: current.description,
        objectives: current.objectives,
        milestones,
        deliverables: current.deliverables,
      });
      current = await get(author, p.id);
      return response;
    };
    const withoutIds = (values: typeof original) =>
      values.map(({ title, required }) => ({ title, required }));

    expect((await saveLegacy(withoutIds(expected))).status).toBe(200);
    expect((await items(p.id)).milestones).toEqual(expected);
    expect(
      (await saveLegacy([{ title: 'New first item', required: true }, ...withoutIds(expected)]))
        .status,
    ).toBe(200);
    const inserted = (await items(p.id)).milestones;
    expect(inserted.slice(1)).toEqual(expected);
    expect(original.map((item) => item.id)).not.toContain(inserted[0]?.id);
    expected = [...inserted].reverse();
    expect((await saveLegacy(withoutIds(expected))).status).toBe(200);
    expect((await items(p.id)).milestones).toEqual(expected);

    const ambiguous = withoutIds([...expected].reverse());
    ambiguous[0] = { title: 'Renamed while reordering', required: true };
    const version = current.version;
    expect((await saveLegacy(ambiguous)).status).toBe(400);
    expect(current.version).toBe(version);
    expect((await items(p.id)).milestones).toEqual(expected);
  });

  it('preserves legacy in-place renames and rejects ambiguous duplicate-title moves', async () => {
    const p = await create();
    const original = await items(p.id);
    const draft = {
      version: p.version,
      title: p.title,
      description: p.description,
      objectives: p.objectives,
      milestones: p.milestones.map((item, index) => ({
        ...item,
        title: index === 0 ? 'Renamed' : item.title,
      })),
      deliverables: p.deliverables,
    };
    expect((await patch(p.id, draft)).status).toBe(200);
    expect((await items(p.id)).milestones.map((item) => item.id)).toEqual(
      original.milestones.map((item) => item.id),
    );
    const duplicateTitles = original.milestones.map((item) => ({ ...item, title: 'Same title' }));
    expect(
      (
        await patch(p.id, {
          ...draft,
          version: (await get(author, p.id)).version,
          milestones: duplicateTitles,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await patch(p.id, {
          ...draft,
          version: (await get(author, p.id)).version,
          milestones: [{ title: 'Same title', required: true }],
        })
      ).status,
    ).toBe(400);
    expect((await items(p.id)).milestones).toEqual(duplicateTitles);
  });

  it('saves swaps, middle deletion, insertion and empty collections under real constraints', async () => {
    const p = await create();
    const { withTransaction } = await import('../../config/db.js');
    const repository = await import('./projects.repository.js');
    const before = await items(p.id);
    const milestones = [...before.milestones].reverse();
    milestones.splice(2, 1);
    milestones.splice(1, 0, { id: randomUUID(), title: 'Inserted', required: false });
    const deliverables = [
      { id: randomUUID(), title: 'Additional outcome', required: false },
      ...before.deliverables,
    ];
    const save = async (structure: {
      objectives: string[];
      milestones: typeof milestones;
      deliverables: typeof deliverables;
    }) => {
      await withTransaction(async (client) => {
        await repository.findProjectForUpdate(client, p.id);
        await repository.saveStructure(client, p.id, {
          title: p.title,
          description: p.description,
          ...structure,
          objectiveIds: structure.objectives.map(() => randomUUID()),
        });
      });
    };
    await save({ objectives: ['First', 'Second'], milestones, deliverables });
    expect(await items(p.id)).toEqual({ milestones, deliverables });
    await save({ objectives: ['Changed'], milestones, deliverables: [...deliverables].reverse() });
    expect((await items(p.id)).deliverables).toEqual([...deliverables].reverse());
    expect((await get(author, p.id)).objectives).toEqual(['Changed']);
    await save({ objectives: [], milestones: [], deliverables: [] });
    expect(await items(p.id)).toEqual({ milestones: [], deliverables: [] });
    expect((await get(author, p.id)).objectives).toEqual([]);
    await save({ objectives: ['Restored'], milestones, deliverables });
    expect(await items(p.id)).toEqual({ milestones, deliverables });
    const draft = {
      version: p.version,
      title: p.title,
      description: p.description,
      objectives: ['Restored'],
      milestones,
      deliverables,
    };
    for (const field of ['objectives', 'milestones', 'deliverables']) {
      expect((await patch(p.id, { ...draft, [field]: [] })).status).toBe(400);
    }
    expect(await items(p.id)).toEqual({ milestones, deliverables });
  });

  it('rejects an older undecided proposal even with the current project version', async () => {
    const p = await create();
    await join(author, p.id, reviewer, 'MAIN_REVIEWER');
    const current = await get(author, p.id);
    expect((await post(author, `/${p.id}/proposals`, { version: current.version })).status).toBe(
      201,
    );
    // The existing database constraints permit this historical pending row.
    const old = await pool.query<{ id: string }>(
      `INSERT INTO project_proposals (project_id, version, structure, submitted_by_user_id)
       VALUES ($1, 0, jsonb_build_object('title', 'Historical proposal'), $2) RETURNING id`,
      [p.id, author.id],
    );
    const pending = await get(reviewer, p.id);
    const response = await post(reviewer, `/${p.id}/proposals/${old.rows[0]!.id}/decision`, {
      version: pending.version,
      decision: 'APPROVE',
      feedback: '',
    });
    expect(response.status).toBe(409);
    expect(await get(reviewer, p.id)).toMatchObject({
      status: 'PROPOSAL_IN_REVIEW',
      version: pending.version,
    });
    const decisions = await pool.query<{ decision: string | null }>(
      'SELECT decision FROM project_proposals WHERE project_id=$1',
      [p.id],
    );
    expect(decisions.rows.every((row) => row.decision === null)).toBe(true);
    const latestId = pending.proposals[0]!.id;
    const results = await Promise.all([
      post(reviewer, `/${p.id}/proposals/${latestId}/decision`, {
        version: pending.version,
        decision: 'APPROVE',
        feedback: '',
      }),
      post(reviewer, `/${p.id}/proposals/${latestId}/decision`, {
        version: pending.version,
        decision: 'REQUEST_CHANGES',
        feedback: 'More evidence',
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it('serializes competing authors and rolls back the stale draft without partial changes', async () => {
    const p = await create(author, true);
    await join(author, p.id, teammate, 'AUTHOR');
    const current = await get(author, p.id);
    const before = await items(p.id);
    const drafts = ['First writer', 'Second writer'].map((title, index) => ({
      version: current.version,
      title,
      description: current.description,
      objectives: [title],
      milestones: index === 0 ? [...before.milestones].reverse() : before.milestones.slice(1),
      deliverables: before.deliverables,
    }));
    const results = await Promise.all(
      [author, teammate].map((actor, index) =>
        request(app)
          .patch(`/api/v1/projects/${p.id}`)
          .set('Cookie', actor.cookie)
          .set('Origin', origin)
          .set('x-csrf-token', actor.csrf)
          .send(drafts[index]),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const winner = drafts[results.findIndex((result) => result.status === 200)]!;
    expect(await get(author, p.id)).toMatchObject({
      title: winner.title,
      objectives: winner.objectives,
      version: current.version + 1,
    });
    expect((await items(p.id)).milestones).toEqual(winner.milestones);
    const events = await pool.query(
      "SELECT id FROM project_events WHERE project_id=$1 AND action='DRAFT_UPDATED'",
      [p.id],
    );
    expect(events.rowCount).toBe(1);
  });

  it('shows invitation history only to the service-authorized roles', async () => {
    const p = await create(author, true);
    await join(author, p.id, teammate, 'AUTHOR');
    await invite(author, p.id, reviewer.email, 'MAIN_REVIEWER');
    for (const [actor, expectedCount] of [
      [author, 2],
      [teammate, 0],
    ] as const) {
      const response = await request(app)
        .get(`/api/v1/projects/${p.id}`)
        .set('Cookie', actor.cookie);
      expect(response.status).toBe(200);
      expect(
        z.object({ invitations: z.array(z.unknown()) }).parse(response.body).invitations,
      ).toHaveLength(expectedCount);
    }
  });

  it('rate limits PATCH requests as well as POST requests', async () => {
    const p = await create();
    // The create request has populated the same network bucket used by PATCH.
    await pool.query('UPDATE auth_rate_limits SET attempts=100');
    const response = await patch(p.id, {
      version: p.version,
      title: p.title,
      description: p.description,
      objectives: p.objectives,
      milestones: p.milestones,
      deliverables: p.deliverables,
    });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('900');
  });
});

describe('editable starting structures', () => {
  const base = {
    title: 'A custom starting plan',
    description: 'A plan tailored to this project.',
    objectives: ['Understand the problem'],
    projectType: 'GROUP',
    approvalRoute: 'IN_PLATFORM_PROPOSAL',
    creatorRole: 'LEAD_AUTHOR',
  };
  it('creates custom milestones and outputs with their order, flags and independent IDs', async () => {
    const milestones = [
      { title: 'Explore the problem', required: true },
      { title: 'Optional pilot', required: false },
    ];
    const deliverables = [
      { title: 'Research report', required: true },
      { title: 'Prototype', required: false },
    ];
    const response = await post(author, '', {
      ...base,
      templateKey: 'custom',
      milestones,
      deliverables,
    });
    expect(response.status).toBe(201);
    const project = projectSchema.parse(response.body);
    projectIds.push(project.id);
    expect(project.milestones).toEqual(milestones);
    expect(project.deliverables).toEqual(deliverables);
    const ids = z
      .object({
        milestones: z.array(z.object({ id: z.string().uuid() })),
        deliverables: z.array(z.object({ id: z.string().uuid() })),
      })
      .parse(response.body);
    expect(new Set([...ids.milestones, ...ids.deliverables].map((item) => item.id)).size).toBe(4);
    const stored = await pool.query(
      'SELECT template_key, template_version FROM projects WHERE id=$1',
      [project.id],
    );
    expect(stored.rows[0]).toEqual({ template_key: 'custom', template_version: 1 });
    expect((await get(author, project.id)).milestones).toEqual(milestones);
  });
  it('overrides a template copy without altering the shared template or legacy defaults', async () => {
    const response = await post(reviewer, '', {
      ...base,
      creatorRole: 'MAIN_REVIEWER',
      templateKey: 'design',
      milestones: [{ title: 'Tailored review stage', required: false }],
      deliverables: [{ title: 'Design notes', required: true }],
    });
    expect(response.status).toBe(201);
    const project = projectSchema.parse(response.body);
    projectIds.push(project.id);
    expect(project.milestones).toEqual([{ title: 'Tailored review stage', required: false }]);
    expect(project.role).toBe('MAIN_REVIEWER');
    const legacy = await create();
    expect(legacy.milestones[0]?.title).toBe('Project brief & proposal');
    expect(legacy.milestones.length).toBe(5);
    expect(legacy.deliverables).toEqual([{ title: 'Final outcome & reflection', required: true }]);
  });
  it('rejects incomplete, empty, oversized or client-assigned starting structures', async () => {
    const item = { title: 'Stage', required: true };
    for (const structure of [
      {},
      { milestones: [item] },
      { milestones: [], deliverables: [item] },
      { milestones: [item], deliverables: [] },
      { milestones: Array.from({ length: 31 }, () => item), deliverables: [item] },
      { milestones: [{ ...item, id: randomUUID() }], deliverables: [item] },
    ]) {
      expect(
        (await post(author, '', { ...base, templateKey: 'custom', ...structure })).status,
      ).toBe(400);
    }
  });
});
