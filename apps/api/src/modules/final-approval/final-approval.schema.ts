import { z } from 'zod';
export const paramsSchema = z.object({ projectId: z.uuid() });
export const decisionParamsSchema = paramsSchema.extend({ requestId: z.uuid() });
export const requestSchema = z
  .object({ version: z.number().int().positive(), key: z.uuid() })
  .strict();
export const decisionSchema = z
  .object({
    key: z.uuid(),
    decision: z.enum(['APPROVE', 'REQUEST_REVISION']),
    feedback: z.string().trim().max(4000).default(''),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.decision === 'REQUEST_REVISION' && !input.feedback)
      ctx.addIssue({
        code: 'custom',
        path: ['feedback'],
        message: 'Explain what needs to change.',
      });
  });
