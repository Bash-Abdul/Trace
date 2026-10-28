import { badRequest } from '../../utils/app-error.js';
import type { Deadline, Schedule } from './deadlines.types.js';
import type { ProjectListItem, ProjectDetailResponse } from '../projects/projects.types.js';

export function validateSchedule(
  schedule: Schedule,
  milestones: { dueDate?: string | null | undefined }[],
): void {
  if ((schedule.dueDate || milestones.some((m) => m.dueDate)) && !schedule.timezone)
    throw badRequest('Choose the project timezone before adding a due date.');
}
export function deadline(
  dueDate: string | null | undefined,
  timezone: string | null | undefined,
  state: string,
  now = new Date(),
): Deadline {
  if (!dueDate) return { state: 'NO_DUE_DATE', daysRemaining: null };
  if (state === 'APPROVED') return { state: 'APPROVED', daysRemaining: null };
  if (['PROPOSAL_REJECTED', 'COMPLETED'].includes(state))
    return { state: 'INACTIVE', daysRemaining: null };
  if (!timezone) throw new Error('A scheduled project must have a timezone');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    calendar: 'gregory',
    numberingSystem: 'latn',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const daysRemaining = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  );
  return {
    state:
      daysRemaining < 0
        ? 'OVERDUE'
        : daysRemaining === 0
          ? 'DUE_TODAY'
          : daysRemaining <= 7
            ? 'DUE_SOON'
            : 'SCHEDULED',
    daysRemaining,
  };
}
export function withDeadlines<T extends ProjectListItem | ProjectDetailResponse>(
  project: T,
  now = new Date(),
): T {
  return {
    ...project,
    deadline: deadline(project.dueDate, project.timezone, project.status, now),
    progress: {
      ...project.progress,
      milestones: project.progress.milestones.map((m) => ({
        ...m,
        deadline: deadline(
          m.dueDate,
          project.timezone,
          project.status === 'PROPOSAL_REJECTED' ? project.status : m.state,
          now,
        ),
      })),
    },
  };
}
