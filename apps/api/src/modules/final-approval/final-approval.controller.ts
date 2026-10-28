import type { AuthenticatedHandler, MutationHandler } from '../auth/auth.types.js';
import type { Detail, RequestInput, DecisionInput } from './final-approval.types.js';
import * as service from './final-approval.service.js';
type Params = { projectId: string };
type DecisionParams = Params & { requestId: string };
export const read: AuthenticatedHandler<Params, unknown, Detail> = async (request, auth) => ({
  status: 200,
  body: await service.read(request.params.projectId, auth.userId),
});
export const create: MutationHandler<Params, RequestInput, Detail> = async (request, auth) => ({
  status: 201,
  body: await service.requestApproval(auth.db, request.params.projectId, auth.userId, request.body),
});
export const decide: MutationHandler<DecisionParams, DecisionInput, Detail> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.decide(
    auth.db,
    request.params.projectId,
    request.params.requestId,
    auth.userId,
    request.body,
  ),
});
export const withdraw: MutationHandler<DecisionParams, unknown, Detail> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.withdraw(
    auth.db,
    request.params.projectId,
    request.params.requestId,
    auth.userId,
  ),
});
