import type { AuthenticatedHandler } from '../auth/auth.types.js';
import type { Portfolio } from './portfolio.types.js';
import { read as portfolio } from './portfolio.service.js';
export const read: AuthenticatedHandler<{ projectId: string }, unknown, Portfolio> = async (
  request,
  auth,
) => ({ status: 200, body: await portfolio(request.params.projectId, auth.userId) });
