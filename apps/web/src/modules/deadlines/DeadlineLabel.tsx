export const deadlineLabels = {
  NO_DUE_DATE: 'No due date',
  SCHEDULED: 'Scheduled',
  DUE_SOON: 'Due soon',
  DUE_TODAY: 'Due today',
  OVERDUE: 'Overdue',
  APPROVED: 'Approved',
  INACTIVE: 'Inactive',
};
export function dateLabel(date: string | null | undefined): string {
  return date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'No due date';
}
export function DeadlineLabel({
  dueDate,
  timezone,
  deadline,
}: {
  dueDate?: string | null | undefined;
  timezone?: string | null | undefined;
  deadline?: { state: keyof typeof deadlineLabels } | undefined;
}) {
  if (!dueDate) return <span>No due date</span>;
  return (
    <span title={`Due through the end of this day in ${timezone ?? 'the project timezone'}`}>
      <time dateTime={dueDate}>{dateLabel(dueDate)}</time>
      {deadline && deadline.state !== 'SCHEDULED' && <> · {deadlineLabels[deadline.state]}</>}
    </span>
  );
}
