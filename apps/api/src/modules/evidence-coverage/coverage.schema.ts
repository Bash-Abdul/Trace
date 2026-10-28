import { z } from 'zod';
export const paramsSchema = z.object({ projectId: z.uuid() });
