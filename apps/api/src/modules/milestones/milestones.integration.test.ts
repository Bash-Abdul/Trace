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
const service = await import('./milestones.service.js');
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
  projectId = randomUUID();
  milestoneId = randomUUID();
  otherMilestoneId = randomUUID();
  projectIds.push(projectId);
  await pool.query(
    `INSERT INTO projects (id, created_by_user_id, project_type, approval_route, title, description, template_key, status)
    VALUES ($1, $2, 'GROUP', 'EXTERNALLY_APPROVED', 'Milestone test', 'Test project', 'design', 'ACTIVE')`,
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

describe('milestone submissions, reviews and feedback', () => {
  it('returns live card and detail progress without exposing another project', async () => {
    const progressSchema = z.object({
      milestones: z.array(
        z.object({ id: z.string(), state: z.string(), evidence_count: z.number() }),
      ),
      unresolved_feedback: z.number(),
      blocking_feedback: z.number(),
      members: z.array(z.object({ user_id: z.string() })),
    });
    async function progress() {
      const detail = await request(app)
        .get(`/api/v1/projects/${projectId}`)
        .set('Cookie', lead.cookie);
      expect(detail.status).toBe(200);
      const value = z.object({ progress: progressSchema }).parse(detail.body).progress;
      const list = await request(app).get('/api/v1/projects').set('Cookie', lead.cookie);
      const listed = z
        .object({ projects: z.array(z.object({ id: z.string(), progress: progressSchema })) })
        .parse(list.body);
      expect(listed.projects.find((p) => p.id === projectId)?.progress).toEqual(value);
      return value;
    }
    const initial = await progress();
    expect(initial.milestones).toEqual([
      { id: milestoneId, state: 'NOT_STARTED', evidence_count: 0 },
      { id: otherMilestoneId, state: 'NOT_STARTED', evidence_count: 0 },
    ]);
    expect(initial.members.map((m) => m.user_id)).toContain(reviewer.id);
    const submittedWork = await submitted();
    const version = submittedWork.submissions[0]!;
    expect(
      (
        await mutation(reviewer, `/submissions/${version.id}/feedback`, {
          body: 'Explain the sample.',
          blocking: true,
        })
      ).status,
    ).toBe(201);
    expect(await progress()).toMatchObject({
      milestones: [
        { id: milestoneId, state: 'AWAITING_REVIEW', evidence_count: 1 },
        { id: otherMilestoneId, state: 'NOT_STARTED', evidence_count: 0 },
      ],
      unresolved_feedback: 1,
      blocking_feedback: 1,
    });
    let current = await read();
    expect(
      (
        await mutation(reviewer, `/feedback/${current.feedback[0]!.id}`, {
          version: current.feedback[0]!.version,
          action: 'RESOLVE',
          body: 'Clarified.',
        })
      ).status,
    ).toBe(200);
    current = await read();
    expect(
      (
        await mutation(reviewer, `/submissions/${version.id}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(200);
    const approved = await progress();
    expect(approved.milestones[0]?.state).toBe('APPROVED');
    expect(approved.unresolved_feedback).toBe(0);
    expect(approved.blocking_feedback).toBe(0);
    expect(
      (await request(app).get(`/api/v1/projects/${projectId}`).set('Cookie', outsider.cookie))
        .status,
    ).toBe(404);
    const hidden = await request(app).get('/api/v1/projects').set('Cookie', outsider.cookie);
    expect(z.object({ projects: z.array(z.unknown()) }).parse(hidden.body).projects).toEqual([]);
  });

  it('preserves immutable versions through revision and enforces feedback ownership', async () => {
    let current = await submitted();
    const first = current.submissions[0]!;
    expect(first.evidence[0]?.created_by).toBe(author.id);
    expect(
      (
        await mutation(author, `/submissions/${first.id}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await mutation(reviewer, `/submissions/${first.id}/feedback`, {
          body: 'Explain the sample selection.',
          blocking: true,
        })
      ).status,
    ).toBe(201);
    current = await read();
    const thread = current.feedback[0]!;
    expect(
      (
        await mutation(author, `/feedback/${thread.id}`, {
          version: thread.version,
          action: 'RESOLVE',
          body: 'Done',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await mutation(author, `/feedback/${thread.id}`, {
          version: thread.version,
          action: 'ADDRESS',
          body: 'Added the rationale.',
        })
      ).status,
    ).toBe(200);
    current = await read();
    expect(current.feedback[0]?.state).toBe('ADDRESSED_BY_AUTHOR');
    expect(
      (
        await mutation(reviewer, `/feedback/${thread.id}`, {
          version: current.feedback[0]!.version,
          action: 'RESOLVE',
          body: 'That answers the question.',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await mutation(reviewer, `/submissions/${first.id}/decision`, {
          version: current.version,
          decision: 'REQUEST_REVISION',
          feedback: 'Include the rationale in the submission.',
        })
      ).status,
    ).toBe(200);
    current = await read();
    expect(current.state).toBe('REVISION_REQUESTED');
    const edited = current.evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      content: 'Revised rationale.',
    }));
    expect(
      (await mutation(lead, '/draft', { version: current.version, evidence: edited })).status,
    ).toBe(200);
    current = await read();
    expect(current.evidence[0]?.id).toBe(first.evidence[0]?.id);
    expect(current.evidence[0]?.created_by).toBe(author.id);
    expect((await mutation(lead, '/submissions', { version: current.version })).status).toBe(201);
    current = await read();
    expect(current.submissions).toHaveLength(2);
    expect(current.submissions[1]?.evidence).toEqual(first.evidence);
    expect(
      (
        await mutation(reviewer, `/submissions/${first.id}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await mutation(reviewer, `/submissions/${current.submissions[0]!.id}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(200);
    expect((await read()).state).toBe('APPROVED');
    const notifications = await pool.query<{ recipient_id: string }>(
      'SELECT recipient_id FROM project_notifications WHERE project_id = $1',
      [projectId],
    );
    expect(notifications.rows.some((row) => row.recipient_id === reviewer.id)).toBe(true);
    expect(notifications.rows.some((row) => row.recipient_id === author.id)).toBe(true);
    expect(notifications.rows.some((row) => row.recipient_id === dormant.id)).toBe(false);
    await expect(
      pool.query(
        "UPDATE milestone_submission_versions SET evidence = '[{}]'::jsonb WHERE id = $1",
        [first.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects stale competing drafts, duplicate submission and duplicate decisions', async () => {
    const results = await Promise.all(
      [lead, author].map((actor) =>
        mutation(actor, '/draft', { version: 0, evidence: [{ ...sample, content: actor.id }] }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    let current = await read();
    expect((await mutation(author, '/submissions', { version: current.version })).status).toBe(403);
    const submissions = await Promise.all(
      [1, 2].map(() => mutation(lead, '/submissions', { version: current.version })),
    );
    expect(submissions.map((result) => result.status).sort()).toEqual([201, 409]);
    current = await read();
    const reviews = await Promise.all(
      [1, 2].map(() =>
        mutation(reviewer, `/submissions/${current.submissions[0]!.id}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        }),
      ),
    );
    expect(reviews.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it('enforces membership, CSRF, active reviewer and same-milestone references', async () => {
    const current = await submitted();
    expect((await request(app).get(path()).set('Cookie', outsider.cookie)).status).toBe(404);
    expect(
      (
        await request(app)
          .patch(path() + '/draft')
          .set('Cookie', lead.cookie)
          .set('Origin', origin)
          .send({ version: current.version, evidence: [] })
      ).status,
    ).toBe(403);
    expect(
      (await mutation(dormant, '/draft', { version: current.version, evidence: [] })).status,
    ).toBe(403);
    expect(
      (
        await mutation(
          lead,
          '/draft',
          { version: 0, evidence: [{ ...sample, id: current.evidence[0]!.id }] },
          otherMilestoneId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await mutation(
          reviewer,
          `/submissions/${current.submissions[0]!.id}/feedback`,
          { body: 'Wrong milestone', blocking: false },
          otherMilestoneId,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await mutation(
          reviewer,
          `/submissions/${current.submissions[0]!.id}/decision`,
          { version: 0, decision: 'APPROVE', feedback: '' },
          otherMilestoneId,
        )
      ).status,
    ).toBe(409);
    await pool.query(
      "UPDATE project_memberships SET role = 'DORMANT_REVIEWER' WHERE project_id = $1 AND user_id = $2",
      [projectId, reviewer.id],
    );
    expect(
      (
        await mutation(reviewer, `/submissions/${current.submissions[0]!.id}/decision`, {
          version: current.version,
          decision: 'APPROVE',
          feedback: '',
        })
      ).status,
    ).toBe(403);
  });

  it('supports empty drafts and stable-ID reordering while rejecting unsafe links', async () => {
    expect(
      (
        await mutation(lead, '/draft', {
          version: 0,
          evidence: [{ ...sample, kind: 'LINK', content: 'javascript:alert(1)' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mutation(lead, '/draft', {
          version: 0,
          evidence: [
            sample,
            { ...sample, title: 'Source', kind: 'LINK', content: 'https://example.com/research' },
          ],
        })
      ).status,
    ).toBe(200);
    let current = await read();
    const reversed = [...current.evidence]
      .reverse()
      .map(({ id, title, kind, content }) => ({ id, title, kind, content }));
    expect(
      (await mutation(lead, '/draft', { version: current.version, evidence: reversed })).status,
    ).toBe(200);
    current = await read();
    expect(current.evidence.map((item) => item.id)).toEqual(reversed.map((item) => item.id));
    expect(
      (await mutation(lead, '/draft', { version: current.version, evidence: [] })).status,
    ).toBe(200);
    current = await read();
    expect(current.evidence).toEqual([]);
    expect((await mutation(lead, '/submissions', { version: current.version })).status).toBe(422);
  });

  it('versions feedback actions, allows reviewer reopening and hides recipient notifications', async () => {
    let current = await submitted();
    const submissionId = current.submissions[0]!.id;
    expect(
      (
        await mutation(reviewer, `/submissions/${submissionId}/feedback`, {
          body: 'Please explain.',
          blocking: true,
        })
      ).status,
    ).toBe(201);
    current = await read();
    const thread = current.feedback[0]!;
    const results = await Promise.all(
      [lead, author].map((actor) =>
        mutation(actor, `/feedback/${thread.id}`, {
          version: thread.version,
          action: 'ADDRESS',
          body: 'Addressed in the draft.',
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    current = await read();
    expect(
      (
        await mutation(reviewer, `/feedback/${thread.id}`, {
          version: current.feedback[0]!.version,
          action: 'RESOLVE',
          body: 'Resolved.',
        })
      ).status,
    ).toBe(200);
    current = await read();
    expect(
      (
        await mutation(author, `/feedback/${thread.id}`, {
          version: current.feedback[0]!.version,
          action: 'REOPEN',
          body: 'Try reopening.',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await mutation(reviewer, `/feedback/${thread.id}`, {
          version: current.feedback[0]!.version,
          action: 'REOPEN',
          body: 'Another point needs clarification.',
        })
      ).status,
    ).toBe(200);
    expect((await read()).feedback[0]?.state).toBe('OPEN');
    const notificationsPath = `/api/v1/projects/${projectId}/notifications`;
    expect((await request(app).get(notificationsPath).set('Cookie', outsider.cookie)).status).toBe(
      404,
    );
    const hidden = await request(app).get(notificationsPath).set('Cookie', dormant.cookie);
    expect(hidden.status).toBe(200);
    expect(hidden.body).toEqual([]);
    const visible = await request(app).get(notificationsPath).set('Cookie', reviewer.cookie);
    expect(visible.status).toBe(200);
    expect(
      z
        .array(z.object({ action: z.string() }))
        .parse(visible.body)
        .some((item) => item.action === 'MILESTONE_SUBMITTED'),
    ).toBe(true);
  });

  it('rejects work on inactive projects and retains attribution when another author only reorders', async () => {
    let current = await draft();
    const evidence = current.evidence.map(({ id, kind, title, content }) => ({
      id,
      kind,
      title,
      content,
    }));
    expect((await mutation(lead, '/draft', { version: current.version, evidence })).status).toBe(
      200,
    );
    current = await read();
    expect(current.evidence[0]?.updated_by).toBe(author.id);
    expect(
      (
        await mutation(lead, '/draft', {
          version: current.version,
          evidence: [...evidence, ...evidence],
        })
      ).status,
    ).toBe(400);
    await pool.query("UPDATE projects SET status = 'SETUP' WHERE id = $1", [projectId]);
    expect((await mutation(lead, '/submissions', { version: current.version })).status).toBe(422);
  });

  it('rolls back draft content, audit and notifications with the transaction', async () => {
    await expect(
      withTransaction(async (client) => {
        await service.saveDraft(client, { projectId, milestoneId }, lead.id, {
          version: 0,
          evidence: [{ ...sample, kind: 'TEXT' }],
        });
        await service.submit(client, { projectId, milestoneId }, lead.id, 1);
        throw new Error('simulate failure');
      }),
    ).rejects.toThrow('simulate failure');
    expect(await read()).toMatchObject({
      state: 'NOT_STARTED',
      version: 0,
      evidence: [],
      submissions: [],
    });
    expect(
      (await pool.query('SELECT id FROM project_events WHERE project_id = $1', [projectId]))
        .rowCount,
    ).toBe(0);
    expect(
      (await pool.query('SELECT id FROM project_notifications WHERE project_id = $1', [projectId]))
        .rowCount,
    ).toBe(0);
  });
});
