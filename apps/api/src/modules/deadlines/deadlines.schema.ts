import { z } from 'zod';
export const dueDateSchema = z.iso
  .date()
  .refine((date) => !date.startsWith('0000'), 'Choose a valid calendar year.')
  .nullable()
  .optional();
export const timezoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    if (!/^[A-Za-z_]/.test(value)) return false;
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid timezone, such as Europe/London.')
  .nullable()
  .optional();
