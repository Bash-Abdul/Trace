import { z } from 'zod';

// Runs before route validation: malformed requests must still be rate limited.
// This extracts a bucket key; each route validates the actual email address.
export const rateLimitBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value.slice(0, 320)),
});
