import { z } from 'zod';
const content = z.object({
  kind: z.enum(['TEXT', 'LINK']),
  content: z.string(),
  note: z.string(),
  created_by: z.string(),
  updated_by: z.string(),
});
export const detailSchema = z.object({
  deliverable: z.object({
    id: z.string(),
    title: z.string(),
    required: z.boolean(),
    archived_at: z.string().nullable(),
  }),
  version: z.number(),
  state: z.enum(['NOT_STARTED', 'DRAFT', 'SUBMITTED']),
  currentSubmissionId: z.string().nullable(),
  draft: content
    .extend({ version: z.number(), state: z.enum(['DRAFT', 'SUBMITTED']), updated_at: z.string() })
    .nullable(),
  submissions: z.array(
    content.extend({
      id: z.string(),
      number: z.number(),
      title: z.string(),
      required: z.boolean(),
      submitted_by: z.string(),
      submitted_at: z.string(),
    }),
  ),
});
export type DeliverableDetail = z.infer<typeof detailSchema>;
