import type { AuthenticatedHandler, MutationHandler } from '../auth/auth.types.js';
import { inboxQuery } from './notifications.schema.js';
import * as service from './notifications.service.js';
import type { Inbox } from './notifications.types.js';
export const list: AuthenticatedHandler<Record<string, never>, unknown, Inbox> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.inbox(auth.userId, inboxQuery.parse(request.query).before),
});
export const mark: MutationHandler<{ notificationId: string }, { read: boolean }, never> = async (
  request,
  auth,
) => {
  await service.mark(auth.db, auth.userId, request.params.notificationId, request.body.read);
  return { status: 204 };
};
export const markAll: MutationHandler<Record<string, never>, object, never> = async (
  _request,
  auth,
) => {
  await service.markAll(auth.db, auth.userId);
  return { status: 204 };
};
