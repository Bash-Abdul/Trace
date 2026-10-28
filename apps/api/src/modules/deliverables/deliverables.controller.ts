import type { AuthenticatedHandler, MutationHandler } from '../auth/auth.types.js';
import type { Params, DraftInput, Detail } from './deliverables.types.js';
import * as service from './deliverables.service.js';
export const read: AuthenticatedHandler<Params, unknown, Detail> = async (request, auth) => ({
  status: 200,
  body: await service.read(request.params, auth.userId),
});
export const saveDraft: MutationHandler<Params, DraftInput, Detail> = async (request, auth) => ({
  status: 200,
  body: await service.saveDraft(auth.db, request.params, auth.userId, request.body),
});
export const submit: MutationHandler<Params, { version: number }, Detail> = async (
  request,
  auth,
) => ({
  status: 201,
  body: await service.submit(auth.db, request.params, auth.userId, request.body.version),
});
export const revise: MutationHandler<Params, { version: number }, Detail> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.revise(auth.db, request.params, auth.userId, request.body.version),
});
