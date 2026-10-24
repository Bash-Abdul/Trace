import { z } from 'zod';
export const queueSchema = z.object({
  truncated: z.boolean(),
  items: z.array(
    z.object({
      id: z.string(),
      project_id: z.string(),
      project_title: z.string(),
      role: z.string(),
      milestone_id: z.string().nullable(),
      milestone_title: z.string().nullable(),
      number: z.number(),
      state: z.string(),
      body: z.string().nullable(),
      blocking: z.boolean(),
      updated_at: z.string(),
      kind: z.enum(['PROPOSAL', 'MILESTONE_SUBMISSION', 'MILESTONE_FEEDBACK']),
      perspective: z.enum(['author', 'reviewer']),
      needs_attention: z.boolean(),
      action: z.string(),
    }),
  ),
});
export type ReviewItem = z.infer<typeof queueSchema>['items'][number];
export const kindLabels = {
  PROPOSAL: 'Proposal review',
  MILESTONE_SUBMISSION: 'Milestone review',
  MILESTONE_FEEDBACK: 'Milestone feedback',
};
export function reviewDestination(item: ReviewItem) {
  return item.milestone_id
    ? `/projects/${item.project_id}/milestones/${item.milestone_id}`
    : `/projects/${item.project_id}?tab=overview`;
}
