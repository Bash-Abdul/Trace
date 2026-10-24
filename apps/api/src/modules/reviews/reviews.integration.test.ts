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
const { pool } = await import('../../config/db.js');
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

const queueSchema = z.object({
  truncated: z.boolean(),
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      project_id: z.string(),
      number: z.number(),
      needs_attention: z.boolean(),
      perspective: z.string(),
      state: z.string(),
    }),
  ),
});
async function queue(actor: Actor) {
  const response = await request(app).get('/api/v1/projects/reviews').set('Cookie', actor.cookie);
  expect(response.status).toBe(200);
  return queueSchema.parse(response.body);
}
async function own(actor: Actor) {
  return (await queue(actor)).items.filter((item) => item.project_id === projectId);
}
describe('live review queue', () => {
  it('isolates memberships and changes attention from reviewer to author through revision', async () => {
    let current = await submitted();
    expect(await own(reviewer)).toEqual([
      expect.objectContaining({
        kind: 'MILESTONE_SUBMISSION',
        needs_attention: true,
        perspective: 'reviewer',
        number: 1,
      }),
    ]);
    expect(await own(author)).toEqual([
      expect.objectContaining({ needs_attention: false, perspective: 'author' }),
    ]);
    expect(await own(outsider)).toEqual([]);
    expect(await own(dormant)).toEqual([]);
    expect((await request(app).get('/api/v1/projects/reviews')).status).toBe(401);
    expect(
      (
        await mutation(reviewer, `/submissions/${current.submissions[0]!.id}/decision`, {
          version: current.version,
          decision: 'REQUEST_REVISION',
          feedback: 'Explain the result',
        })
      ).status,
    ).toBe(200);
    expect((await own(author))[0]?.needs_attention).toBe(true);
    expect((await own(reviewer))[0]?.needs_attention).toBe(false);
    current = await read();
    expect(
      (
        await mutation(author, '/draft', {
          version: current.version,
          evidence: current.evidence.map(({ id, title, kind, content }) => ({
            id,
            title,
            kind,
            content,
          })),
        })
      ).status,
    ).toBe(200);
    expect((await own(author))[0]?.state).toBe('DRAFT');
    current = await read();
    await mutation(lead, '/submissions', { version: current.version });
    expect(await own(reviewer)).toEqual([
      expect.objectContaining({ needs_attention: true, number: 2 }),
    ]);
    current = await read();
    await mutation(reviewer, `/submissions/${current.submissions[0]!.id}/decision`, {
      version: current.version,
      decision: 'APPROVE',
      feedback: '',
    });
    expect(await own(reviewer)).toEqual([]);
  });
  it('keeps version-specific unresolved feedback after approval and removes it on resolution', async () => {
    let current = await submitted();
    await mutation(reviewer, `/submissions/${current.submissions[0]!.id}/feedback`, {
      body: 'Explain the method',
      blocking: true,
    });
    current = await read();
    const thread = current.feedback[0]!;
    expect(
      (await own(author)).find((item) => item.kind === 'MILESTONE_FEEDBACK')?.needs_attention,
    ).toBe(true);
    await mutation(author, `/feedback/${thread.id}`, {
      version: thread.version,
      action: 'ADDRESS',
      body: 'Explained',
    });
    expect(
      (await own(reviewer)).find((item) => item.kind === 'MILESTONE_FEEDBACK')?.needs_attention,
    ).toBe(true);
    current = await read();
    await mutation(reviewer, `/submissions/${current.submissions[0]!.id}/decision`, {
      version: current.version,
      decision: 'APPROVE',
      feedback: '',
    });
    expect(await own(reviewer)).toEqual([
      expect.objectContaining({ kind: 'MILESTONE_FEEDBACK', number: 1 }),
    ]);
    await mutation(reviewer, `/feedback/${thread.id}`, {
      version: current.feedback[0]!.version,
      action: 'RESOLVE',
      body: 'Clear now',
    });
    expect(await own(reviewer)).toEqual([]);
    current = await read();
    await mutation(reviewer, `/feedback/${thread.id}`, {
      version: current.feedback[0]!.version,
      action: 'REOPEN',
      body: 'One more question',
    });
    expect((await own(author))[0]?.needs_attention).toBe(true);
    await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [
      projectId,
      author.id,
    ]);
    expect(await own(author)).toEqual([]);
  });
  it('only exposes the latest proposal and removes completed reviews', async () => {
    await pool.query("UPDATE projects SET status='PROPOSAL_IN_REVIEW' WHERE id=$1", [projectId]);
    await pool.query(
      'INSERT INTO project_proposals (project_id,version,structure,submitted_by_user_id) VALUES ($1,1,$2,$3),($1,2,$2,$3)',
      [projectId, JSON.stringify({ title: 'Plan' }), lead.id],
    );
    expect(await own(reviewer)).toEqual([
      expect.objectContaining({ kind: 'PROPOSAL', number: 2, needs_attention: true }),
    ]);
    await pool.query(
      "UPDATE project_proposals SET decision='REQUEST_CHANGES',feedback='Clarify scope',decided_at=now(),decided_by_user_id=$2 WHERE project_id=$1 AND version=2",
      [projectId, reviewer.id],
    );
    await pool.query("UPDATE projects SET status='PROPOSAL_CHANGES_REQUESTED' WHERE id=$1", [
      projectId,
    ]);
    expect((await own(lead))[0]?.needs_attention).toBe(true);
    await pool.query("UPDATE projects SET status='PROPOSAL_REJECTED' WHERE id=$1", [projectId]);
    expect(await own(reviewer)).toEqual([]);
  });
  it('bounds large queues and explicitly reports truncation', async () => {
    const current = await submitted();
    await pool.query(
      "INSERT INTO milestone_feedback (submission_version_id,body,blocking,created_by) SELECT $1,'Review note',false,$2 FROM generate_series(1,201)",
      [current.submissions[0]!.id, reviewer.id],
    );
    const result = await queue(author);
    expect(result.truncated).toBe(true);
    expect(result.items.filter((item) => item.kind === 'MILESTONE_FEEDBACK')).toHaveLength(200);
  });
});
