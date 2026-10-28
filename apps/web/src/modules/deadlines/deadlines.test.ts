import { expect, it } from 'vitest';
import { dateLabel } from './DeadlineLabel';
it('formats calendar dates without a viewer timezone shift', () => {
  expect(dateLabel('2026-03-29')).toBe('29 Mar 2026');
  expect(dateLabel('2026-10-25')).toBe('25 Oct 2026');
  expect(dateLabel(null)).toBe('No due date');
});
