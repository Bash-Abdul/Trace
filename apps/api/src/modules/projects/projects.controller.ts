import type { AuthenticatedHandler, MutationHandler } from '../auth/auth.types.js';
import { templates } from './projects.templates.js';
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
  MemberProject,
  ProjectDetailResponse,
  InvitationResponse,
} from './projects.types.js';

// Validation has already transformed input. Authentication middleware supplies context
// and sends these HTTP results only after the mutation transaction commits.
export const listTemplates: AuthenticatedHandler<
  Record<string, never>,
  unknown,
  { templates: typeof templates }
> = () => Promise.resolve({ status: 200, body: { templates } });
export const listProjects: AuthenticatedHandler<
  Record<string, never>,
  unknown,
  { projects: MemberProject[] }
> = async (_request, auth) => ({
  status: 200,
  body: { projects: await service.listProjects(auth.db, auth.userId) },
});
export const createProject: MutationHandler<
  Record<string, never>,
  CreateProject,
  ProjectDetailResponse
> = async (request, auth) => ({
  status: 201,
  body: await service.createProject(auth.db, auth.userId, request.body),
});
export const getProject: AuthenticatedHandler<
  ProjectParams,
  unknown,
  ProjectDetailResponse
> = async (request, auth) => ({
  status: 200,
  body: await service.getProject(auth.db, request.params.id, auth.userId),
});
export const updateDraft: MutationHandler<ProjectParams, Draft, ProjectDetailResponse> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.updateDraft(auth.db, request.params.id, auth.userId, request.body),
});
export const invite: MutationHandler<ProjectParams, Invitation, InvitationResponse> = async (
  request,
  auth,
) => ({
  status: 201,
  body: await service.invite(auth.db, request.params.id, auth.userId, request.body),
});
export const cancelInvitation: MutationHandler<InvitationParams, unknown, void> = async (
  request,
  auth,
) => {
  await service.cancelInvitation(
    auth.db,
    request.params.id,
    request.params.invitationId,
    auth.userId,
  );
  return { status: 204 };
};
export const acceptInvitation: MutationHandler<
  Record<string, never>,
  InvitationAcceptance,
  { projectId: string }
> = async (request, auth) => ({
  status: 200,
  body: await service.acceptInvitation(auth.db, auth.userId, request.body.token),
});
export const submitProposal: MutationHandler<
  ProjectParams,
  VersionInput,
  ProjectDetailResponse
> = async (request, auth) => ({
  status: 201,
  body: await service.submitProposal(auth.db, request.params.id, auth.userId, request.body.version),
});
export const decideProposal: MutationHandler<
  ProposalParams,
  Decision,
  ProjectDetailResponse
> = async (request, auth) => ({
  status: 200,
  body: await service.decideProposal(
    auth.db,
    request.params.id,
    request.params.proposalId,
    auth.userId,
    request.body,
  ),
});
