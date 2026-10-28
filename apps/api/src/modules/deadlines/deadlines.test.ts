import { describe, expect, it } from 'vitest';
import { deadline, validateSchedule } from './deadlines.service.js';
import { dueDateSchema, timezoneSchema } from './deadlines.schema.js';
describe('optional calendar deadlines', () => {
  it('accepts no deadline and requires a timezone only for actual dates', () => {
    expect(deadline(null, null, 'DRAFT')).toEqual({ state: 'NO_DUE_DATE', daysRemaining: null });
    expect(() => validateSchedule({}, [{}])).not.toThrow();
    expect(() => validateSchedule({}, [{ dueDate: '2026-10-26' }])).toThrow('timezone');
    expect(() => validateSchedule({ dueDate: '2026-10-26' }, [])).toThrow('timezone');
  });
  it('validates real calendar dates and named timezones', () => {
    for (const value of ['2026-02-29', '2026-13-01', '0000-01-01', '2026-10-26T12:00:00Z', ''])
      expect(dueDateSchema.safeParse(value).success).toBe(false);
    expect(dueDateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(timezoneSchema.safeParse('Europe/London').success).toBe(true);
    expect(timezoneSchema.safeParse('UTC').success).toBe(true);
    expect(timezoneSchema.safeParse('Not/A_Zone').success).toBe(false);
    expect(timezoneSchema.safeParse('+01:00').success).toBe(false);
  });
  it('uses calendar days for due today, next seven days and later dates', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(deadline('2026-10-26', 'Europe/London', 'DRAFT', now)).toEqual({
      state: 'DUE_TODAY',
      daysRemaining: 0,
    });
    expect(deadline('2026-11-02', 'Europe/London', 'DRAFT', now)).toEqual({
      state: 'DUE_SOON',
      daysRemaining: 7,
    });
    expect(deadline('2026-11-03', 'Europe/London', 'DRAFT', now).state).toBe('SCHEDULED');
    expect(deadline('2026-10-25', 'Europe/London', 'DRAFT', now).state).toBe('OVERDUE');
  });
  it.each([
    ['2026-03-29', '2026-03-29T22:59:59Z', '2026-03-29T23:00:00Z'],
    ['2026-10-25', '2026-10-25T23:59:59Z', '2026-10-26T00:00:00Z'],
  ])('handles the end of %s across daylight-saving transitions', (due, before, after) => {
    expect(deadline(due, 'Europe/London', 'DRAFT', new Date(before)).state).toBe('DUE_TODAY');
    expect(deadline(due, 'Europe/London', 'DRAFT', new Date(after)).state).toBe('OVERDUE');
  });
  it('uses the project timezone rather than the server or viewer timezone', () => {
    const now = new Date('2026-10-27T00:30:00Z');
    expect(deadline('2026-10-26', 'America/Los_Angeles', 'DRAFT', now).state).toBe('DUE_TODAY');
    expect(deadline('2026-10-26', 'Europe/London', 'DRAFT', now).state).toBe('OVERDUE');
  });
  it('does not call approved or rejected work overdue', () => {
    const now = new Date('2026-10-27T12:00:00Z');
    expect(deadline('2020-01-01', 'UTC', 'APPROVED', now).state).toBe('APPROVED');
    expect(deadline('2020-01-01', 'UTC', 'PROPOSAL_REJECTED', now).state).toBe('INACTIVE');
  });
});
