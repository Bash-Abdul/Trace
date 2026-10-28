export type DeadlineState =
  'NO_DUE_DATE' | 'SCHEDULED' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'APPROVED' | 'INACTIVE';
export interface Deadline {
  state: DeadlineState;
  daysRemaining: number | null;
}
export interface Schedule {
  dueDate?: string | null | undefined;
  timezone?: string | null | undefined;
}
