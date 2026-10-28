import type { AuthenticatedHandler, MutationHandler } from '../auth/auth.types.js';
import type {
  ChangeInput,
  MinorInput,
  ChangeDecision,
  Params,
  ChangeParams,
  Change,
} from './changes.types.js';
import * as service from './changes.service.js';
export const list: AuthenticatedHandler<Params, unknown, Change[]> = async (r, a) => ({
  status: 200,
  body: await service.list(a.db, r.params.projectId, a.userId),
});
export const minor: MutationHandler<Params, MinorInput, void> = async (r, a) => {
  await service.minor(a.db, r.params.projectId, a.userId, r.body);
  return { status: 204 };
};
export const create: MutationHandler<Params, ChangeInput, Change> = async (r, a) => ({
  status: 201,
  body: await service.create(a.db, r.params.projectId, a.userId, r.body),
});
export const edit: MutationHandler<ChangeParams, ChangeInput, void> = async (r, a) => {
  await service.edit(a.db, r.params.projectId, r.params.changeId, a.userId, r.body);
  return { status: 204 };
};
export const submit: MutationHandler<ChangeParams, { version: number }, void> = async (r, a) => {
  await service.act(
    a.db,
    r.params.projectId,
    r.params.changeId,
    a.userId,
    r.body.version,
    'SUBMIT',
  );
  return { status: 204 };
};
export const withdraw: MutationHandler<ChangeParams, { version: number }, void> = async (r, a) => {
  await service.act(
    a.db,
    r.params.projectId,
    r.params.changeId,
    a.userId,
    r.body.version,
    'WITHDRAW',
  );
  return { status: 204 };
};
export const decide: MutationHandler<ChangeParams, ChangeDecision, void> = async (r, a) => {
  await service.decide(a.db, r.params.projectId, r.params.changeId, a.userId, r.body);
  return { status: 204 };
};
