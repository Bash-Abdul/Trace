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
    case 'GROUP_AUTHOR_REMOVED':
      return 'Group Author removed';
    case 'GROUP_LEAD_TRANSFERRED':
      return 'Group lead Author changed';
    case 'PROJECT_MINOR_EDIT':
      return 'Project wording updated';
    case 'PROJECT_CHANGE_SUBMITTED':
      return 'Project change ready for review';
    case 'PROJECT_CHANGE_WITHDRAWN':
      return 'Project change withdrawn';
    case 'PROJECT_CHANGE_DECIDED':
      return decision === 'APPROVE' ? 'Project change approved' : 'Project change rejected';
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
  if (item.action === 'GROUP_AUTHOR_REMOVED' || item.action === 'GROUP_LEAD_TRANSFERRED')
    return `/projects/${item.project_id}?tab=team`;
  if (item.action.startsWith('PROJECT_CHANGE_') || item.action === 'PROJECT_MINOR_EDIT')
    return `/projects/${item.project_id}?tab=changes`;
  return item.milestone_id
    ? `/projects/${item.project_id}/milestones/${item.milestone_id}`
    : `/projects/${item.project_id}?tab=overview`;
}
