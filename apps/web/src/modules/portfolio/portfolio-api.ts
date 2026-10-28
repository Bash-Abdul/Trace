import { z } from 'zod';
import { detailSchema } from '../workspace/workspace-api';
import { milestoneDetailSchema, evidenceSchema } from '../milestones/milestones-api';
import { detailSchema as deliverableSchema } from '../deliverables/deliverables-api';
import { changeSchema } from '../changes/changes-api';
import { finalSchema } from '../final-approval/final-approval-api';
export const portfolioSchema = z.object({
  mode: z.enum(['LIVE', 'FINAL']),
  checklist: finalSchema.shape.checklist,
  recordedAt: z.string().nullable(),
  project: detailSchema.extend({
    created_at: z.string(),
    activated_at: z.string().nullable(),
    template_version: z.number(),
    proposals: z.array(
      detailSchema.shape.proposals.element.extend({
        submitted_at: z.string(),
        submitted_by_user_id: z.string(),
        decided_at: z.string().nullable(),
        decided_by_user_id: z.string().nullable(),
      }),
    ),
  }),
  records: z.object({
    events: detailSchema.shape.events,
    submissions: z.array(
      milestoneDetailSchema.shape.submissions.element.extend({ milestone_id: z.string() }),
    ),
    deliverables: z.array(
      deliverableSchema.shape.submissions.element.extend({ deliverable_id: z.string() }),
    ),
    feedback: milestoneDetailSchema.shape.feedback,
    messages: milestoneDetailSchema.shape.messages,
    changes: z.array(
      changeSchema.extend({ created_by: z.string(), decided_by: z.string().nullable() }),
    ),
  }),
  drafts: z.array(evidenceSchema.extend({ milestone_id: z.string() })),
  finalRequest: finalSchema.shape.requests.element
    .extend({ decided_by: z.string().nullable() })
    .nullable(),
});
export type Portfolio = z.infer<typeof portfolioSchema>;
