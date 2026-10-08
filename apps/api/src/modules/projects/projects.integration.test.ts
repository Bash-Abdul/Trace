import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('Project tests require a _test database');
process.env.DATABASE_URL = testUrl;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { pool, withTransaction } = await import('../../config/db.js');
const { createApp } = await import('../../app.js');
const { hashPassword, hashOpaqueToken } = await import('../auth/auth-crypto/auth-crypto.js');
const { login, withSession } = await import('../auth/auth.service.js');
const { cookieName } = await import('../auth/auth-policy.js');
const app = createApp();
const actorIds: string[] = [];
const projectIds: string[] = [];
let passwordHash: string;
interface Actor {
  id: string;
  email: string;
  cookie: string;
  csrf: string;
}
interface Invite {
  id: string;
  token: string;
  email: string;
  role: string;
}
interface Created {
  project: {
    id: string;
    author_user_id: string | null;
    created_by_user_id: string;
    status: string;
  };
  invitation: Invite | null;
}
async function actor(): Promise<Actor> {
  const email = `projects-${randomUUID()}@example.com`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, email_verified_at)
    VALUES ($1, $2, now()) RETURNING id`,
    [email, passwordHash],
  );
  const id = result.rows[0]!.id;
  actorIds.push(id);
  const session = await login(email, 'ProjectPassword123!', null);
  return { id, email, cookie: `${cookieName}=${session.rawToken}`, csrf: session.csrfToken };
}
function post(path: string, user: Actor) {
  return request(app)
    .post(`/api/v1/projects${path}`)
    .set('Cookie', user.cookie)
    .set('Origin', 'http://localhost:3000')
    .set('x-csrf-token', user.csrf);
}
function remove(path: string, user: Actor) {
  return request(app)
    .delete(`/api/v1/projects${path}`)
    .set('Cookie', user.cookie)
    .set('Origin', 'http://localhost:3000')
    .set('x-csrf-token', user.csrf);
}
function get(path: string, user: Actor) {
  return request(app).get(`/api/v1/projects${path}`).set('Cookie', user.cookie);
}
async function create(user: Actor, reviewer = false, invited?: Actor): Promise<Created> {
  const response = await post('', user).send({
    title: 'Research project',
    approvalRoute: 'IN_PLATFORM_PROPOSAL',
    creatorRole: reviewer ? 'MAIN_REVIEWER' : 'AUTHOR',
    ...(invited ? { inviteEmail: invited.email } : {}),
  });
  expect(response.status).toBe(201);
  const result = response.body as Created;
  projectIds.push(result.project.id);
  return result;
}
function accept(user: Actor, token: string, key = randomUUID()) {
  return post('/invitations/accept', user).set('Idempotency-Key', key).send({ token });
}
async function invite(owner: Actor, projectId: string, user: Actor, role: string) {
  const response = await post(`/${projectId}/invitations`, owner).send({ email: user.email, role });
  expect(response.status).toBe(201);
  return response.body as Invite;
}
beforeAll(async () => {
  passwordHash = await hashPassword('ProjectPassword123!');
});
beforeEach(async () => {
  await pool.query('DELETE FROM auth_rate_limits');
});
afterAll(async () => {
  await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
  await pool.query('DELETE FROM auth_audit_events WHERE user_id = ANY($1::uuid[])', [actorIds]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [actorIds]);
  await pool.query('DELETE FROM auth_rate_limits');
  await pool.end();
});

describe('project access and invitations', () => {
  it('creates permanent Author membership and scopes project lists and details', async () => {
    const author = await actor();
    const outsider = await actor();
    const created = await create(author);
    expect(created.project).toMatchObject({
      author_user_id: author.id,
      created_by_user_id: author.id,
      status: 'SETUP',
    });
    const ownList = await get('', author);
    expect(ownList.body).toMatchObject({
      projects: [{ id: created.project.id, role: 'AUTHOR' }],
      nextCursor: null,
    });
    expect((await get('', outsider)).body).toEqual({ projects: [], nextCursor: null });
    for (const path of [
      `/${created.project.id}`,
      `/${created.project.id}/invitations`,
      `/${created.project.id}/history`,
    ]) {
      expect((await get(path, outsider)).status).toBe(404);
    }
    expect(
      (
        await post(`/${created.project.id}/invitations`, outsider).send({
          email: author.email,
          role: 'MAIN_REVIEWER',
        })
      ).status,
    ).toBe(404);
    expect((await request(app).get('/api/v1/projects')).status).toBe(401);
  });

  it('lets a Reviewer create a project and atomically assign the invited Author', async () => {
    const reviewer = await actor();
    const author = await actor();
    expect(
      (
        await post('', reviewer).send({
          title: 'Missing Author',
          creatorRole: 'MAIN_REVIEWER',
          approvalRoute: 'EXTERNALLY_APPROVED',
        })
      ).status,
    ).toBe(400);
    const created = await create(reviewer, true, author);
    expect(created.project.author_user_id).toBeNull();
    expect((await accept(author, created.invitation!.token)).status).toBe(200);
    const detail = await get(`/${created.project.id}`, author);
    expect(detail.body).toMatchObject({
      author_user_id: author.id,
      created_by_user_id: reviewer.id,
      role: 'AUTHOR',
      status: 'SETUP',
    });
    await expect(
      pool.query('UPDATE projects SET author_user_id = $2 WHERE id = $1', [
        created.project.id,
        reviewer.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query("UPDATE projects SET approval_route = 'EXTERNALLY_APPROVED' WHERE id = $1", [
        created.project.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query("DELETE FROM project_memberships WHERE project_id = $1 AND role = 'AUTHOR'", [
        created.project.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('requires verified invited email and never stores or lists raw invitation tokens', async () => {
    const author = await actor();
    const reviewer = await actor();
    const outsider = await actor();
    const created = await create(author, false, reviewer);
    expect((await accept(outsider, created.invitation!.token)).status).toBe(404);
    await pool.query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [reviewer.id]);
    expect((await accept(reviewer, created.invitation!.token)).status).toBe(404);
    await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [reviewer.id]);
    const saved = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM project_invitations WHERE id = $1',
      [created.invitation!.id],
    );
    expect(saved.rows[0]?.token_hash).toBe(hashOpaqueToken(created.invitation!.token));
    const list = await get(`/${created.project.id}/invitations`, author);
    expect(JSON.stringify(list.body)).not.toContain(created.invitation!.token);
    expect(JSON.stringify(list.body)).not.toContain('token_hash');
    expect((await accept(reviewer, created.invitation!.token)).status).toBe(200);
  });

  it('expires, replaces, and cancels invitations without allowing old-token acceptance', async () => {
    const author = await actor();
    const reviewer = await actor();
    const created = await create(author, false, reviewer);
    const first = created.invitation!;
    await pool.query(
      "UPDATE project_invitations SET expires_at = now() - interval '1 second' WHERE id = $1",
      [first.id],
    );
    expect((await accept(reviewer, first.token)).status).toBe(404);
    const resend = await post(`/${created.project.id}/invitations/${first.id}/resend`, author);
    expect(resend.status).toBe(201);
    const second = resend.body as Invite;
    expect(second.token).not.toBe(first.token);
    expect((await accept(reviewer, first.token)).status).toBe(404);
    expect((await remove(`/${created.project.id}/invitations/${second.id}`, author)).status).toBe(
      204,
    );
    expect((await accept(reviewer, second.token)).status).toBe(404);
  });

  it('makes concurrent acceptance idempotent only for the same account, token, and key', async () => {
    const author = await actor();
    const reviewer = await actor();
    const created = await create(author, false, reviewer);
    const key = randomUUID();
    const results = await Promise.all([
      accept(reviewer, created.invitation!.token, key),
      accept(reviewer, created.invitation!.token, key),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    expect((await accept(reviewer, created.invitation!.token)).status).toBe(404);
    expect((await accept(reviewer, 'a'.repeat(43), key)).status).toBe(409);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text FROM project_memberships WHERE project_id = $1 AND role = 'MAIN_REVIEWER'",
      [created.project.id],
    );
    expect(count.rows[0]?.count).toBe('1');
    const another = await create(author, false, reviewer);
    const racing = await Promise.all([
      accept(reviewer, another.invitation!.token),
      accept(reviewer, another.invitation!.token),
    ]);
    expect(racing.map((result) => result.status).sort()).toEqual([200, 404]);
  });

  it('keeps dormant Reviewers read-only and prevents Author-controlled reviewer succession', async () => {
    const author = await actor();
    const main = await actor();
    const dormant = await actor();
    const extra = await actor();
    const created = await create(author, false, main);
    await accept(main, created.invitation!.token);
    expect(
      (
        await post(`/${created.project.id}/invitations`, author).send({
          email: dormant.email,
          role: 'DORMANT_REVIEWER',
        })
      ).status,
    ).toBe(403);
    const dormantInvite = await invite(main, created.project.id, dormant, 'DORMANT_REVIEWER');
    expect((await accept(dormant, dormantInvite.token)).status).toBe(200);
    expect((await get(`/${created.project.id}`, dormant)).status).toBe(200);
    expect((await get(`/${created.project.id}/history`, dormant)).status).toBe(200);
    expect(
      (
        await post(`/${created.project.id}/invitations`, dormant).send({
          email: extra.email,
          role: 'MAIN_REVIEWER',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(`/${created.project.id}/invitations`, author).send({
          email: extra.email,
          role: 'MAIN_REVIEWER',
        })
      ).status,
    ).toBe(409);
    await invite(main, created.project.id, extra, 'DORMANT_REVIEWER');
    const notifications = await pool.query<{ count: string }>(
      'SELECT count(*)::text FROM project_notifications WHERE recipient_user_id = $1 AND project_id = $2',
      [dormant.id, created.project.id],
    );
    expect(notifications.rows[0]?.count).toBe('0');
    const authorNotifications = await pool.query<{ count: string }>(
      'SELECT count(*)::text FROM project_notifications WHERE recipient_user_id = $1 AND project_id = $2',
      [author.id, created.project.id],
    );
    expect(Number(authorNotifications.rows[0]?.count)).toBeGreaterThan(0);
  });

  it('preserves the pending Author slot when replacing an invitation', async () => {
    const reviewer = await actor();
    const first = await actor();
    const replacement = await actor();
    const created = await create(reviewer, true, first);
    expect(
      (await remove(`/${created.project.id}/invitations/${created.invitation!.id}`, reviewer))
        .status,
    ).toBe(409);
    const next = await invite(reviewer, created.project.id, replacement, 'AUTHOR');
    expect((await accept(first, created.invitation!.token)).status).toBe(404);
    expect((await accept(replacement, next.token)).status).toBe(200);
    await expect(
      pool.query(
        "INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, 'MAIN_REVIEWER')",
        [created.project.id, first.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('checks CSRF and origin and rolls back invalid Author-slot transactions', async () => {
    const user = await actor();
    const input = {
      title: 'Protected',
      creatorRole: 'AUTHOR',
      approvalRoute: 'IN_PLATFORM_PROPOSAL',
    };
    expect(
      (
        await request(app)
          .post('/api/v1/projects')
          .set('Cookie', user.cookie)
          .set('Origin', 'http://localhost:3000')
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/projects')
          .set('Cookie', user.cookie)
          .set('Origin', 'https://evil.example')
          .set('x-csrf-token', user.csrf)
          .send(input)
      ).status,
    ).toBe(403);
    await expect(
      withTransaction(async (client) => {
        await client.query(
          "INSERT INTO projects (title, created_by_user_id, approval_route) VALUES ('Invalid setup', $1, 'IN_PLATFORM_PROPOSAL')",
          [user.id],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
    expect((await get('', user)).body).toEqual({ projects: [], nextCursor: null });
  });

  it('serializes two members acting concurrently without deadlocking notification foreign keys', async () => {
    const author = await actor();
    const reviewer = await actor();
    const created = await create(author, false, reviewer);
    await accept(reviewer, created.invitation!.token);
    const { requireProject, recordProjectEvent } = await import('./projects.repository.js');
    let signalProjectLock = () => {};
    let signalOtherAccountLock = () => {};
    const projectLocked = new Promise<void>((resolve) => {
      signalProjectLock = resolve;
    });
    const otherAccountLocked = new Promise<void>((resolve) => {
      signalOtherAccountLock = resolve;
    });
    const first = withSession(author.cookie.split('=')[1]!, undefined, async (client) => {
      await requireProject(client, created.project.id, author.id);
      signalProjectLock();
      await otherAccountLocked;
      await recordProjectEvent(client, created.project.id, author.id, 'TEST_CONCURRENT_AUTHOR');
    });
    const second = (async () => {
      await projectLocked;
      return withSession(reviewer.cookie.split('=')[1]!, undefined, async (client) => {
        signalOtherAccountLock();
        await requireProject(client, created.project.id, reviewer.id);
        await recordProjectEvent(
          client,
          created.project.id,
          reviewer.id,
          'TEST_CONCURRENT_REVIEWER',
        );
      });
    })();
    await Promise.all([first, second]);
    const events = await pool.query<{ count: string }>(
      "SELECT count(*)::text FROM project_audit_events WHERE project_id = $1 AND event LIKE 'TEST_CONCURRENT_%'",
      [created.project.id],
    );
    expect(events.rows[0]?.count).toBe('2');
  });

  it('paginates assigned projects without crossing account boundaries', async () => {
    const author = await actor();
    const outsider = await actor();
    const first = await create(author);
    const second = await create(author);
    await create(outsider);
    const pageOne = (await get('?limit=1', author)).body as {
      projects: { id: string }[];
      nextCursor: string;
    };
    const pageTwo = (await get(`?limit=1&after=${pageOne.nextCursor}`, author)).body as {
      projects: { id: string }[];
      nextCursor: string | null;
    };
    expect([pageOne.projects[0]!.id, pageTwo.projects[0]!.id].sort()).toEqual(
      [first.project.id, second.project.id].sort(),
    );
    expect(pageTwo.nextCursor).toBeNull();
  });
});
