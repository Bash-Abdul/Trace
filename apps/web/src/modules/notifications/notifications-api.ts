import { z } from 'zod';
export const inboxSchema = z.object({
  unread_count: z.number(),
  next_cursor: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      project_id: z.string(),
      project_title: z.string(),
      milestone_id: z.string().nullable(),
      milestone_title: z.string().nullable(),
      action: z.string(),
      details: z.record(z.string(), z.unknown()),
      created_at: z.string(),
      read_at: z.string().nullable(),
    }),
  ),
});
export type Inbox = z.infer<typeof inboxSchema>;
export type Notification = Inbox['items'][number];
export function notificationLabel(item: Notification) {
  const decision = item.details.decision;
  switch (item.action) {
    case 'PROPOSAL_SUBMITTED':
      return 'Proposal ready for review';
    case 'PROPOSAL_DECIDED':
      return decision === 'APPROVE'
        ? 'Proposal approved'
        : decision === 'REJECT'
          ? 'Proposal rejected'
          : 'Proposal changes requested';
    case 'MILESTONE_SUBMITTED':
      return 'Milestone submitted for review';
    case 'MILESTONE_REVIEWED':
      return decision === 'APPROVE'
        ? 'Milestone approved'
        : decision === 'REQUEST_REVISION'
          ? 'Milestone revision requested'
          : 'Milestone reviewed';
    case 'MILESTONE_FEEDBACK_CREATED':
      return 'New milestone feedback';
    case 'MILESTONE_FEEDBACK_UPDATED':
      return (
        (
          {
            ADDRESS: 'Milestone feedback addressed',
            RESOLVE: 'Milestone feedback resolved',
            REOPEN: 'Milestone feedback reopened',
            RESPOND: 'Reply to milestone feedback',
          } as Record<string, string>
        )[String(item.details.action)] ?? 'Milestone feedback updated'
      );
    default:
      return 'Project update';
  }
}
export function notificationDestination(item: Notification) {
  return item.milestone_id
    ? `/projects/${item.project_id}/milestones/${item.milestone_id}`
    : `/projects/${item.project_id}?tab=overview`;
}
