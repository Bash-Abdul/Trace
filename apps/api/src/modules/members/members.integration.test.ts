import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('Members tests require an isolated _test database');
process.env.DATABASE_URL = testUrl;
process.env.APP_ORIGIN = 'http://localhost:3000';
const { pool, withTransaction: tx } = await import('../../config/db.js');
const projects = await import('../projects/projects.service.js');
const projectRepo = await import('../projects/projects.repository.js');
const members = await import('./members.service.js');
const milestones = await import('../milestones/milestones.service.js');
const notifications = await import('../notifications/notifications.service.js');
const reviews = await import('../reviews/reviews.service.js');
const { hashPassword, hashOpaqueToken } = await import('../auth/auth-crypto/auth-crypto.js');
const { login } = await import('../auth/auth.service.js');
const { lockSessionAccount } = await import('../auth/auth.repository.js');
const { cookieName } = await import('../auth/auth-policy.js');
const { createApp } = await import('../../app.js');
const app = createApp();
const users = Array.from({ length: 5 }, () => randomUUID());
const [lead, author, reviewer, otherAuthor, outsider] = users as [
  string,
  string,
  string,
  string,
  string,
];
const ids: string[] = [];
const email = (id: string) => `members-${id}@example.com`;
const password = 'MembershipTestPassword1!';
let cookie: string, csrf: string, leadToken: string, authorToken: string;
beforeAll(async () => {
  const hash = await hashPassword(password);
  for (const id of users)
    await pool.query(
      'INSERT INTO users(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,now())',
      [id, email(id), hash],
    );
  const session = await login(email(lead), password, null);
  cookie = `${cookieName}=${session.rawToken}`;
  csrf = session.csrfToken;
  leadToken = session.rawToken;
  authorToken = (await login(email(author), password, null)).rawToken;
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
      title: 'Shared study',
      description: 'Study shared spaces',
      objectives: ['Understand access'],
      projectType: group ? 'GROUP' : 'INDIVIDUAL',
      approvalRoute: 'EXTERNALLY_APPROVED',
      creatorRole: 'LEAD_AUTHOR',
      templateKey: 'design',
    }),
  );
  ids.push(p.id);
  await tx(async (db) => {
    await projectRepo.addMember(db, p.id, reviewer, 'MAIN_REVIEWER');
    if (group) {
      await projectRepo.addMember(db, p.id, author, 'AUTHOR');
      await projectRepo.addMember(db, p.id, otherAuthor, 'AUTHOR');
    }
    await projectRepo.activateExternal(db, p.id);
  });
  return projects.getProject(pool, p.id, lead);
}
function params(projectId: string, userId = author) {
  return { projectId, userId };
}
function input(version: number) {
  return { version, reason: 'Agreed team responsibility change' };
}
describe('group member management', () => {
  it('removes membership while its Author saves work without an account/project deadlock', async () => {
    const p = await setup();
    const leadClient = await pool.connect();
    const authorClient = await pool.connect();
    let authorWork: Promise<unknown> | undefined;
    try {
      await leadClient.query('BEGIN');
      await authorClient.query('BEGIN');
      await leadClient.query("SET LOCAL lock_timeout = '4s'");
      await authorClient.query("SET LOCAL lock_timeout = '4s'");
      await lockSessionAccount(leadClient, hashOpaqueToken(leadToken));
      await projectRepo.findMemberProjectForUpdate(leadClient, p.id, lead);
      await lockSessionAccount(authorClient, hashOpaqueToken(authorToken));
      authorWork = milestones
        .saveDraft(authorClient, { projectId: p.id, milestoneId: p.milestones[0]!.id }, author, {
          version: 0,
          evidence: [{ title: 'Concurrent notes', kind: 'TEXT', content: 'Work in progress' }],
        })
        .catch((error: unknown) => error);
      await members.remove(leadClient, params(p.id), lead, input(p.version));
      await leadClient.query('COMMIT');
      expect(await authorWork).toMatchObject({ message: 'Project not found' });
    } finally {
      await leadClient.query('ROLLBACK');
      if (authorWork) await authorWork;
      await authorClient.query('ROLLBACK');
      leadClient.release();
      authorClient.release();
    }
  });

  it('requires authenticated origin/CSRF-protected requests and validates the reason', async () => {
    const p = await setup();
    const path = `/api/v1/projects/${p.id}/members/${author}/remove`;
    expect((await request(app).post(path).send(input(p.version))).status).toBe(403);
    expect(
      (await request(app).post(path).set('Origin', process.env.APP_ORIGIN!).send(input(p.version)))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(path)
          .set('Cookie', cookie)
          .set('Origin', process.env.APP_ORIGIN!)
          .send(input(p.version))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(path)
          .set('Cookie', cookie)
          .set('Origin', process.env.APP_ORIGIN!)
          .set('x-csrf-token', csrf)
          .send({ ...input(p.version), reason: '' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(path)
          .set('Cookie', cookie)
          .set('Origin', process.env.APP_ORIGIN!)
          .set('x-csrf-token', csrf)
          .send(input(p.version))
      ).status,
    ).toBe(204);
  });
  it('removes access but retains attributed evidence, feedback, creator provenance and membership history', async () => {
    const p = await setup();
    const mp = { projectId: p.id, milestoneId: p.milestones[0]!.id };
    const d = await tx((db) =>
      milestones.saveDraft(db, mp, author, {
        version: 0,
        evidence: [{ title: 'Notes', kind: 'TEXT', content: 'My contribution' }],
      }),
    );
    const submitted = await tx((db) => milestones.submit(db, mp, lead, d.version));
    const f = await tx((db) =>
      milestones.addFeedback(db, mp, submitted.submissions[0]!.id, reviewer, {
        body: 'Explain the sample',
        blocking: true,
      }),
    );
    await tx((db) =>
      milestones.updateFeedback(db, mp, f.feedback[0]!.id, author, {
        version: 1,
        action: 'RESPOND',
        body: 'My explanation',
      }),
    );
    expect((await notifications.inbox(author)).items.some((n) => n.project_id === p.id)).toBe(true);
    await tx((db) => members.remove(db, params(p.id), lead, input(p.version)));
    await expect(projects.getProject(pool, p.id, author)).rejects.toThrow('not found');
    await expect(milestones.read(mp, author)).rejects.toThrow('not found');
    await expect(
      tx((db) => milestones.saveDraft(db, mp, author, { version: d.version, evidence: [] })),
    ).rejects.toThrow('not found');
    expect((await notifications.inbox(author)).items.some((n) => n.project_id === p.id)).toBe(
      false,
    );
    expect((await reviews.getQueue(author)).items.some((n) => n.project_id === p.id)).toBe(false);
    const current = await projects.getProject(pool, p.id, lead);
    expect(current.created_by_user_id).toBe(lead);
    expect(current.former_members).toMatchObject([{ user_id: author, email: email(author) }]);
    const history = await milestones.read(mp, reviewer);
    expect(history.submissions[0]!.evidence[0]!.created_by).toBe(author);
    expect(history.messages[0]!.author_id).toBe(author);
    expect(history.submissions[0]!.submitted_by).toBe(lead);
  });
  it('transfers lead atomically, preserves contributions and cancels old-lead pending invitations', async () => {
    const p = await setup();
    const invitation = await tx((db) =>
      projects.invite(db, p.id, lead, { email: email(outsider), role: 'AUTHOR' }),
    );
    const fresh = await projects.getProject(pool, p.id, lead);
    await tx((db) => members.transferLead(db, params(p.id), lead, input(fresh.version)));
    const current = await projects.getProject(pool, p.id, author);
    expect(current.role).toBe('LEAD_AUTHOR');
    expect(current.members.find((m) => m.user_id === lead)?.role).toBe('AUTHOR');
    expect(current.members.filter((m) => m.role === 'LEAD_AUTHOR')).toHaveLength(1);
    expect(current.created_by_user_id).toBe(lead);
    const token = new URLSearchParams(new URL(invitation.invitationUrl).hash.slice(1)).get(
      'token',
    )!;
    await expect(tx((db) => projects.acceptInvitation(db, outsider, token))).rejects.toThrow(
      'invalid',
    );
    await expect(
      tx((db) => members.remove(db, params(p.id, otherAuthor), lead, input(current.version))),
    ).rejects.toThrow('lead');
    await expect(
      tx((db) => projects.invite(db, p.id, lead, { email: email(outsider), role: 'AUTHOR' })),
    ).rejects.toThrow('not allowed');
    const mp = { projectId: p.id, milestoneId: p.milestones[0]!.id };
    const d = await tx((db) =>
      milestones.saveDraft(db, mp, lead, {
        version: 0,
        evidence: [{ title: 'Lead contribution', kind: 'TEXT', content: 'Still an Author' }],
      }),
    );
    await expect(tx((db) => milestones.submit(db, mp, lead, d.version))).rejects.toThrow('role');
    await tx((db) => milestones.submit(db, mp, author, d.version));
  });
  it('rejects individual changes, current-lead removal, reviewer targets and outsiders', async () => {
    const p = await setup();
    const single = await setup(false);
    await expect(
      tx((db) => members.remove(db, params(single.id, lead), lead, input(single.version))),
    ).rejects.toThrow('group');
    await expect(
      tx((db) => members.remove(db, params(p.id, lead), lead, input(p.version))),
    ).rejects.toThrow('accepted');
    await expect(
      tx((db) => members.transferLead(db, params(p.id, reviewer), lead, input(p.version))),
    ).rejects.toThrow('accepted');
    await expect(
      tx((db) => members.remove(db, params(p.id), reviewer, input(p.version))),
    ).rejects.toThrow('lead');
    await expect(
      tx((db) => members.remove(db, params(p.id), outsider, input(p.version))),
    ).rejects.toThrow('not found');
    await expect(
      tx((db) => members.transferLead(db, params(p.id, outsider), lead, input(p.version))),
    ).rejects.toThrow('not found');
  });
  it('serialises competing transfer/removal and rolls back both role changes on failure', async () => {
    const p = await setup();
    const results = await Promise.allSettled([
      tx((db) => members.transferLead(db, params(p.id), lead, input(p.version))),
      tx((db) => members.remove(db, params(p.id), lead, input(p.version))),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT user_id FROM project_memberships WHERE project_id=$1 AND role='LEAD_AUTHOR'",
          [p.id],
        )
      ).rowCount,
    ).toBe(1);
    const another = await setup();
    await expect(
      tx(async (db) => {
        await members.transferLead(db, params(another.id), lead, input(another.version));
        throw new Error('Simulated transaction failure');
      }),
    ).rejects.toThrow('Simulated');
    expect((await projects.getProject(pool, another.id, lead)).role).toBe('LEAD_AUTHOR');
    expect(
      (
        await pool.query(
          "SELECT id FROM project_events WHERE project_id=$1 AND action='GROUP_LEAD_TRANSFERRED'",
          [another.id],
        )
      ).rowCount,
    ).toBe(0);
  });
  it('allows author re-invitation, preserves removal history, but prohibits reviewing former work', async () => {
    const p = await setup();
    await tx((db) => members.remove(db, params(p.id), lead, input(p.version)));
    await expect(
      tx((db) => projects.invite(db, p.id, lead, { email: email(author), role: 'MAIN_REVIEWER' })),
    ).rejects.toThrow('former Author');
    const invite = await tx((db) =>
      projects.invite(db, p.id, lead, { email: email(author), role: 'AUTHOR' }),
    );
    const token = new URLSearchParams(new URL(invite.invitationUrl).hash.slice(1)).get('token')!;
    await tx((db) => projects.acceptInvitation(db, author, token));
    const current = await projects.getProject(pool, p.id, author);
    expect(current.role).toBe('AUTHOR');
    expect(current.former_members.some((m) => m.user_id === author)).toBe(false);
    expect(
      (
        await pool.query(
          'SELECT id FROM project_membership_removals WHERE project_id=$1 AND user_id=$2',
          [p.id, author],
        )
      ).rowCount,
    ).toBe(1);
    await tx((db) => members.remove(db, params(p.id), lead, input(current.version)));
    expect(
      (
        await pool.query(
          'SELECT id FROM project_membership_removals WHERE project_id=$1 AND user_id=$2',
          [p.id, author],
        )
      ).rowCount,
    ).toBe(2);
  });
});
