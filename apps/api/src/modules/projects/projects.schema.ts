import { z } from 'zod';

const title = z.string().trim().min(1).max(120);
export const requirementSchema = z
  .object({ id: z.uuid().optional(), title, required: z.boolean() })
  .strict();
export const milestoneItemSchema = z
  .object({
    id: z.uuid().optional(),
    title,
    required: z.boolean(),
    objectiveIds: z.array(z.uuid()).max(20).optional(),
    expectedEvidence: z.array(requirementSchema).max(30).optional(),
  })
  .strict();
const startingItem = z.object({ title, required: z.boolean() }).strict();

export const briefSchema = z.object({
  title,
  description: z.string().trim().min(1).max(2000),
  objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  objectiveIds: z.array(z.uuid().nullable()).max(20).optional(),
});

export const createProjectSchema = briefSchema
  .extend({
    projectType: z.enum(['INDIVIDUAL', 'GROUP']),
    approvalRoute: z.enum(['IN_PLATFORM_PROPOSAL', 'EXTERNALLY_APPROVED']),
    templateKey: z.enum(['design', 'research', 'software', 'independent', 'custom']),
    milestones: z
      .array(milestoneItemSchema.omit({ id: true }))
      .min(1)
      .max(30)
      .optional(),
    deliverables: z.array(startingItem).min(1).max(20).optional(),
    creatorRole: z.enum(['LEAD_AUTHOR', 'MAIN_REVIEWER']).default('LEAD_AUTHOR'),
  })
  .strict()
  .refine(
    (input) =>
      input.templateKey !== 'custom' ||
      (input.milestones !== undefined && input.deliverables !== undefined),
    { message: 'Custom projects require milestones and deliverables' },
  );

export const versionSchema = z.object({ version: z.number().int().positive() }).strict();

export const draftSchema = briefSchema
  .extend({
    version: versionSchema.shape.version,
    milestones: z.array(milestoneItemSchema).min(1).max(30),
    deliverables: z
      .array(z.object({ id: z.string().uuid().optional(), title, required: z.boolean() }).strict())
      .min(1)
      .max(20),
  })
  .strict();

export const invitationSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    role: z.enum(['AUTHOR', 'MAIN_REVIEWER', 'LEAD_AUTHOR']),
  })
  .strict();

export const decisionSchema = versionSchema
  .extend({
    decision: z.enum(['APPROVE', 'REQUEST_CHANGES', 'REJECT']),
    feedback: z.string().trim().max(2000),
  })
  .strict()
  .refine((v) => v.decision === 'APPROVE' || v.feedback.length > 0, 'Explain the decision');

export const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export const projectParamsSchema = z.object({ id: z.string().uuid() });

export const invitationParamsSchema = projectParamsSchema.extend({
  invitationId: z.string().uuid(),
});

export const proposalParamsSchema = projectParamsSchema.extend({ proposalId: z.string().uuid() });
