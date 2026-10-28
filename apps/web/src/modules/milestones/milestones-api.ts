import { z } from 'zod';

export const evidenceSchema = z.object({
  objectiveIds: z.array(z.string()).optional(),
  expectationIds: z.array(z.string()).optional(),
  objectiveMappings: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
  expectationMappings: z
    .array(z.object({ id: z.string(), title: z.string(), required: z.boolean() }))
    .optional(),
  id: z.string(),
  title: z.string(),
  kind: z.enum(['TEXT', 'LINK']),
  content: z.string(),
  created_by: z.string(),
  updated_by: z.string(),
});
export const milestoneDetailSchema = z.object({
  deadline: z
    .object({
      state: z.enum([
        'NO_DUE_DATE',
        'SCHEDULED',
        'DUE_SOON',
        'DUE_TODAY',
        'OVERDUE',
        'APPROVED',
        'INACTIVE',
      ]),
      daysRemaining: z.number().nullable(),
    })
    .optional(),
  milestone: z.object({
    dueDate: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    id: z.string(),
    title: z.string(),
    required: z.boolean(),
    archived_at: z.string().nullable().optional(),
  }),
  version: z.number(),
  state: z.enum(['NOT_STARTED', 'DRAFT', 'AWAITING_REVIEW', 'REVISION_REQUESTED', 'APPROVED']),
  evidence: z.array(evidenceSchema),
  submissions: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      coverage: z
        .object({
          dueDate: z.string().nullable().optional(),
          timezone: z.string().nullable().optional(),
          objectives: z.array(z.object({ id: z.string(), title: z.string() })),
          expectedEvidence: z.array(
            z.object({ id: z.string(), title: z.string(), required: z.boolean() }),
          ),
        })
        .nullable()
        .optional(),
      evidence: z.array(evidenceSchema),
      submitted_by: z.string(),
      submitted_at: z.string(),
      decision: z.enum(['APPROVE', 'REQUEST_REVISION']).nullable(),
      feedback: z.string().nullable(),
      decided_by: z.string().nullable(),
      decided_at: z.string().nullable(),
    }),
  ),
  feedback: z.array(
    z.object({
      id: z.string(),
      submission_version_id: z.string(),
      body: z.string(),
      blocking: z.boolean(),
      state: z.enum(['OPEN', 'ADDRESSED_BY_AUTHOR', 'RESOLVED_BY_REVIEWER']),
      version: z.number(),
      created_by: z.string(),
      created_at: z.string(),
    }),
  ),
  messages: z.array(
    z.object({
      id: z.string(),
      feedback_id: z.string(),
      author_id: z.string(),
      body: z.string(),
      created_at: z.string(),
    }),
  ),
});
export const notificationSchema = z.array(
  z.object({
    id: z.string(),
    milestone_id: z.string(),
    action: z.string(),
    created_at: z.string(),
  }),
);
export type MilestoneDetail = z.infer<typeof milestoneDetailSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export const stateLabels = {
  NOT_STARTED: 'Not started',
  DRAFT: 'Draft',
  AWAITING_REVIEW: 'Awaiting review',
  REVISION_REQUESTED: 'Revision requested',
  APPROVED: 'Approved',
};
export type MilestoneOperation = (
  suffix: string,
  body: object,
  method?: 'POST' | 'PATCH',
) => Promise<boolean>;
