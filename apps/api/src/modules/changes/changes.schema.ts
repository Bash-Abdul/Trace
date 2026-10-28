import { z } from 'zod';
import { draftSchema } from '../projects/projects.schema.js';
export const paramsSchema = z.object({ projectId: z.uuid() });
export const changeParamsSchema = paramsSchema.extend({ changeId: z.uuid() });
export const changeSchema = draftSchema
  .extend({ reason: z.string().trim().min(1).max(2000) })
  .strict();
export const minorSchema = changeSchema.extend({ meaningUnchanged: z.literal(true) }).strict();
export const actionSchema = z.object({ version: z.number().int().positive() }).strict();
export const decisionSchema = actionSchema
  .extend({
    decision: z.enum(['APPROVE', 'REJECT']),
    feedback: z.string().trim().max(2000),
  })
  .strict()
  .refine(
    (v) => v.decision === 'APPROVE' || v.feedback.length > 0,
    'Explain why the change is rejected',
  );
