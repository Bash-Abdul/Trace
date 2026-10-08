import { Router, type Request } from 'express';
import { z } from 'zod';
import { withSession } from '../auth/auth.service.js';
import { readSessionCookie } from '../auth/auth-policy.js';
import {
  authBrowserControls,
  authRateLimit,
  requireMutationOrigin,
} from '../auth/auth.middleware.js';
import { forbidden } from '../../utils/app-error.js';
import {
  acceptInvitation,
  createProject,
  issueInvitation,
  manageInvitation,
} from './projects.service.js';
import { projectDetail, requireProject, type Project } from './projects.repository.js';
import {
  acceptanceSchema,
  createProjectSchema,
  invitationSchema,
  pageSchema,
  parseInput,
  uuidSchema,
} from './projects.schema.js';

export const projectsRouter = Router();
projectsRouter.use(authBrowserControls, authRateLimit);
projectsRouter.use((request, response, next) => {
  if (request.method === 'GET' || request.method === 'HEAD') return next();
  return requireMutationOrigin(request, response, next);
});
function session<T>(request: Request, operation: Parameters<typeof withSession<T>>[2]) {
  const csrf =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : (request.get('x-csrf-token') ?? '');
  return withSession(readSessionCookie(request.headers.cookie), csrf, operation);
}
projectsRouter.post('/', async (request, response) => {
  const input = parseInput(createProjectSchema, request.body);
  const result = await session(request, (client, actor) =>
    createProject(client, actor.user_id, input),
  );
  response.status(201).json(result);
});
projectsRouter.get('/', async (request, response) => {
  const page = parseInput(pageSchema, request.query);
  const result = await session(request, async (client, actor) => {
    const projects = await client.query<Project & { role: string }>(
      `SELECT p.*, m.role FROM projects p
      JOIN project_memberships m ON p.id = m.project_id AND m.user_id = $1
      WHERE ($2::uuid IS NULL OR p.id > $2) ORDER BY p.id LIMIT $3`,
      [actor.user_id, page.after ?? null, page.limit + 1],
    );
    const rows = projects.rows.slice(0, page.limit);
    return {
      projects: rows,
      nextCursor: projects.rows.length > page.limit ? rows.at(-1)!.id : null,
    };
  });
  response.json(result);
});
projectsRouter.post('/invitations/accept', async (request, response) => {
  const { token } = parseInput(acceptanceSchema, request.body);
  const key = parseInput(
    z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    request.get('idempotency-key'),
  );
  response.json(
    await session(request, (client, actor) => acceptInvitation(client, actor.user_id, token, key)),
  );
});
projectsRouter.get('/:projectId', async (request, response) => {
  const id = parseInput(uuidSchema, request.params.projectId);
  response.json(
    await session(request, (client, actor) => projectDetail(client, id, actor.user_id)),
  );
});
projectsRouter.post('/:projectId/invitations', async (request, response) => {
  const id = parseInput(uuidSchema, request.params.projectId);
  const input = parseInput(invitationSchema, request.body);
  response
    .status(201)
    .json(
      await session(request, (client, actor) => issueInvitation(client, id, actor.user_id, input)),
    );
});
projectsRouter.get('/:projectId/invitations', async (request, response) => {
  const id = parseInput(uuidSchema, request.params.projectId);
  const page = parseInput(pageSchema, request.query);
  response.json(
    await session(request, async (client, actor) => {
      const project = await requireProject(client, id, actor.user_id);
      if (project.role === 'DORMANT_REVIEWER')
        throw forbidden('Invitation management is restricted', 'PROJECT_ROLE_DENIED');
      const invitations = await client.query<{
        id: string;
        email: string;
        role: string;
        expires_at: Date;
        accepted_at: Date | null;
        cancelled_at: Date | null;
      }>(
        `SELECT id, email, role, expires_at, accepted_at, cancelled_at
      FROM project_invitations WHERE project_id = $1 AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3`,
        [id, page.after ?? null, page.limit + 1],
      );
      const rows = invitations.rows.slice(0, page.limit);
      return {
        invitations: rows,
        nextCursor: invitations.rows.length > page.limit ? rows.at(-1)!.id : null,
      };
    }),
  );
});
projectsRouter.post('/:projectId/invitations/:invitationId/resend', async (request, response) => {
  const id = parseInput(uuidSchema, request.params.projectId);
  const invitationId = parseInput(uuidSchema, request.params.invitationId);
  response
    .status(201)
    .json(
      await session(request, (client, actor) =>
        manageInvitation(client, id, actor.user_id, invitationId, true),
      ),
    );
});
projectsRouter.delete('/:projectId/invitations/:invitationId', async (request, response) => {
  const id = parseInput(uuidSchema, request.params.projectId);
  const invitationId = parseInput(uuidSchema, request.params.invitationId);
  await session(request, (client, actor) =>
    manageInvitation(client, id, actor.user_id, invitationId, false),
  );
  response.status(204).end();
});
projectsRouter.get('/:projectId/history', async (request, response) => {
  const id = parseInput(uuidSchema, request.params.projectId);
  const page = parseInput(pageSchema, request.query);
  response.json(
    await session(request, async (client, actor) => {
      await requireProject(client, id, actor.user_id);
      const events = await client.query<{
        id: string;
        actor_user_id: string;
        event: string;
        created_at: Date;
      }>(
        `SELECT id, actor_user_id, event, created_at FROM project_audit_events
      WHERE project_id = $1 AND ($2::uuid IS NULL OR (created_at, id) >
        (SELECT created_at, id FROM project_audit_events WHERE id = $2 AND project_id = $1))
        ORDER BY created_at, id LIMIT $3`,
        [id, page.after ?? null, page.limit + 1],
      );
      const rows = events.rows.slice(0, page.limit);
      return { events: rows, nextCursor: events.rows.length > page.limit ? rows.at(-1)!.id : null };
    }),
  );
});
