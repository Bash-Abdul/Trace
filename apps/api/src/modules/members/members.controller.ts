import type { MutationHandler } from '../auth/auth.types.js';
import type { MemberParams, MembershipAction } from './members.types.js';
import * as service from './members.service.js';
export const remove: MutationHandler<MemberParams, MembershipAction, void> = async (r, a) => {
  await service.remove(a.db, r.params, a.userId, r.body);
  return { status: 204 };
};
export const transferLead: MutationHandler<MemberParams, MembershipAction, void> = async (r, a) => {
  await service.transferLead(a.db, r.params, a.userId, r.body);
  return { status: 204 };
};
