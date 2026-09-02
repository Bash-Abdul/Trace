import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email({ message: 'Invalid email address' }),

    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters long' })
      .max(32, { message: 'Password must be at most 32 characters long' }),
  })
  .strict();

export type RegisterSchema = z.infer<typeof registerSchema>;
