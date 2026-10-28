import { z } from 'zod';
export const memberParams = z.object({ projectId: z.uuid(), userId: z.uuid() });
export const membershipAction = z
  .object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
