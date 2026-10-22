import { z } from 'zod';

export const milestoneParams = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
});
export const reviewParams = milestoneParams.extend({ submissionId: z.string().uuid() });
export const feedbackParams = milestoneParams.extend({ feedbackId: z.string().uuid() });
export const versionSchema = z.object({ version: z.number().int().nonnegative() }).strict();
const evidenceSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(120),
    kind: z.enum(['TEXT', 'LINK']),
    content: z.string().trim().min(1).max(10000),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.kind === 'LINK') {
      const url = z.url({ protocol: /^https?$/ }).safeParse(item.content);
      if (!url.success) {
        context.addIssue({
          code: 'custom',
          path: ['content'],
          message: 'Use an http or https link.',
        });
      }
    }
  });
export const draftSchema = versionSchema.extend({ evidence: z.array(evidenceSchema).max(30) });
export const decisionSchema = versionSchema
  .extend({
    decision: z.enum(['APPROVE', 'REQUEST_REVISION']),
    feedback: z.string().trim().max(2000),
  })
  .refine(
    (input) => input.decision === 'APPROVE' || input.feedback.length > 0,
    'Explain the requested revision.',
  );
export const feedbackSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    blocking: z.boolean(),
  })
  .strict();
export const feedbackUpdateSchema = versionSchema.extend({
  action: z.enum(['RESPOND', 'ADDRESS', 'RESOLVE', 'REOPEN']),
  body: z.string().trim().min(1).max(2000),
});

export const notificationParams = z.object({ projectId: z.string().uuid() });
