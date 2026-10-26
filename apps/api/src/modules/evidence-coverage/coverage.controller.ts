import type { AuthenticatedHandler } from '../auth/auth.types.js';
import type { Coverage } from './coverage.types.js';
import { read } from './coverage.service.js';
export const getCoverage: AuthenticatedHandler<{ projectId: string }, unknown, Coverage> = async (
  request,
  auth,
) => ({ status: 200, body: await read(request.params.projectId, auth.userId) });
