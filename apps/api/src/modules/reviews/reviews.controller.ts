import type { AuthenticatedHandler } from '../auth/auth.types.js';
import type { ReviewQueue } from './reviews.types.js';
import { getQueue } from './reviews.service.js';
export const list: AuthenticatedHandler<Record<string, never>, unknown, ReviewQueue> = async (
  _request,
  auth,
) => ({ status: 200, body: await getQueue(auth.userId) });
