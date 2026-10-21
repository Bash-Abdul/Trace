import type { Request, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { readSessionCookie } from '../auth/auth-policy.js';
import { withSession } from '../auth/auth.service.js';
import { templates } from './projects.schema.js';
import * as service from './projects.service.js';
import type {
  CreateProject,
  Draft,
  Invitation,
  Decision,
  InvitationAcceptance,
  VersionInput,
  ProjectParams,
  InvitationParams,
  ProposalParams,
} from './projects.types.js';

// Validate middleware owns parsing; controllers own HTTP and the authenticated transaction.
function authenticated<T>(
  request: Request,
  operation: (client: PoolClient, userId: string) => Promise<T>,
) {
  return withSession(
    readSessionCookie(request.headers.cookie),
    request.method === 'GET' ? undefined : (request.get('x-csrf-token') ?? ''),
    (client, session) => operation(client, session.user_id),
  );
}
export const listTemplates: RequestHandler = async (request, response) => {
  response.json(await authenticated(request, () => Promise.resolve({ templates })));
};
export const listProjects: RequestHandler = async (request, response) => {
  const projects = await authenticated(request, (client, userId) =>
    service.listProjects(client, userId),
  );
  response.json({ projects });
};
export const createProject: RequestHandler<Record<string, never>, unknown, CreateProject> = async (
  request,
  response,
) => {
  response
    .status(201)
    .json(
      await authenticated(request, (client, userId) =>
        service.createProject(client, userId, request.body),
      ),
    );
};
export const getProject: RequestHandler<ProjectParams> = async (request, response) => {
  response.json(
    await authenticated(request, (client, userId) =>
      service.getProject(client, request.params.id, userId),
    ),
  );
};
export const updateDraft: RequestHandler<ProjectParams, unknown, Draft> = async (
  request,
  response,
) => {
  response.json(
    await authenticated(request, (client, userId) =>
      service.updateDraft(client, request.params.id, userId, request.body),
    ),
  );
};
export const invite: RequestHandler<ProjectParams, unknown, Invitation> = async (
  request,
  response,
) => {
  response
    .status(201)
    .json(
      await authenticated(request, (client, userId) =>
        service.invite(client, request.params.id, userId, request.body),
      ),
    );
};
export const cancelInvitation: RequestHandler<InvitationParams> = async (request, response) => {
  await authenticated(request, (client, userId) =>
    service.cancelInvitation(client, request.params.id, request.params.invitationId, userId),
  );
  response.status(204).end();
};
export const acceptInvitation: RequestHandler<
  Record<string, never>,
  unknown,
  InvitationAcceptance
> = async (request, response) => {
  response.json(
    await authenticated(request, (client, userId) =>
      service.acceptInvitation(client, userId, request.body.token),
    ),
  );
};
export const submitProposal: RequestHandler<ProjectParams, unknown, VersionInput> = async (
  request,
  response,
) => {
  response
    .status(201)
    .json(
      await authenticated(request, (client, userId) =>
        service.submitProposal(client, request.params.id, userId, request.body.version),
      ),
    );
};
export const decideProposal: RequestHandler<ProposalParams, unknown, Decision> = async (
  request,
  response,
) => {
  response.json(
    await authenticated(request, (client, userId) =>
      service.decideProposal(
        client,
        request.params.id,
        request.params.proposalId,
        userId,
        request.body,
      ),
    ),
  );
};
