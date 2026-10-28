import { z } from 'zod';
export const paramsSchema = z.object({ projectId: z.uuid(), deliverableId: z.uuid() });
export const versionSchema = z.object({ version: z.number().int().nonnegative() }).strict();
export const draftSchema = versionSchema
  .extend({
    kind: z.enum(['TEXT', 'LINK']),
    content: z.string().trim().min(1).max(20000),
    note: z.string().trim().max(2000).default(''),
  })
  .superRefine((item, context) => {
    if (item.kind === 'LINK' && !z.url({ protocol: /^https?$/ }).safeParse(item.content).success)
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'Use an http or https link.',
      });
  });
