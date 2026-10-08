import { z } from 'zod';
import { badRequest } from '../../utils/app-error.js';

export const projectRole = z.enum(['AUTHOR', 'MAIN_REVIEWER', 'DORMANT_REVIEWER']);
const email = z.string().trim().toLowerCase().email().max(254);
export const createProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    approvalRoute: z.enum(['IN_PLATFORM_PROPOSAL', 'EXTERNALLY_APPROVED']),
    creatorRole: z.enum(['AUTHOR', 'MAIN_REVIEWER']),
    inviteEmail: email.optional(),
  })
  .strict()
  .refine(
    (input) => input.creatorRole !== 'MAIN_REVIEWER' || input.inviteEmail !== undefined,
    'A Reviewer-created project requires an Author invitation',
  );
export const invitationSchema = z.object({ email, role: projectRole }).strict();
export const acceptanceSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const uuidSchema = z.string().uuid();
export const pageSchema = z
  .object({
    after: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ProjectRole = z.infer<typeof projectRole>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw badRequest('Validation failed', 'VALIDATION_ERROR');
  return parsed.data;
}
