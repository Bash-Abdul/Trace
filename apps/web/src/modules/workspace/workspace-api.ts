import { z } from 'zod';

const roleSchema = z.enum(['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER', 'DORMANT_REVIEWER']);
const deadlineSchema = z.object({
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
});
const requirement = z.object({ id: z.string(), title: z.string(), required: z.boolean() });
const item = requirement.extend({
  dueDate: z.string().nullable().optional(),
  objectiveIds: z.array(z.string()).optional(),
  expectedEvidence: z.array(requirement).optional(),
});
const progressSchema = z.object({
  deliverables: z
    .array(
      z.object({
        id: z.string(),
        required: z.boolean(),
        state: z.enum(['NOT_STARTED', 'DRAFT', 'SUBMITTED']),
        currentSubmissionId: z.string().nullable(),
        number: z.number().nullable(),
      }),
    )
    .optional(),
  milestones: z.array(
    z.object({
      id: z.string(),
      required: z.boolean(),
      title: z.string().optional(),
      dueDate: z.string().nullable().optional(),
      deadline: deadlineSchema.optional(),
      state: z.enum(['NOT_STARTED', 'DRAFT', 'AWAITING_REVIEW', 'REVISION_REQUESTED', 'APPROVED']),
      evidence_count: z.number(),
    }),
  ),
  unresolved_feedback: z.number(),
  blocking_feedback: z.number(),
  members: z.array(z.object({ user_id: z.string(), email: z.string() })),
});
export const summarySchema = z.object({
  dueDate: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  deadline: deadlineSchema.optional(),
  id: z.string(),
  title: z.string(),
  description: z.string(),
  project_type: z.enum(['INDIVIDUAL', 'GROUP']),
  approval_route: z.enum(['IN_PLATFORM_PROPOSAL', 'EXTERNALLY_APPROVED']),
  status: z.enum([
    'SETUP',
    'PROPOSAL_IN_REVIEW',
    'PROPOSAL_CHANGES_REQUESTED',
    'PROPOSAL_REJECTED',
    'ACTIVE',
    'FINAL_APPROVAL_PENDING',
    'COMPLETED',
  ]),
  version: z.number(),
  template_key: z.string().optional(),
  progress: progressSchema.optional(),
  role: roleSchema,
});
export const structureSchema = z.object({
  dueDate: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  objectives: z.array(z.string()),
  objectiveIds: z.array(z.string()).optional(),
  milestones: z.array(item),
  deliverables: z.array(item),
});
export const detailSchema = summarySchema.extend({
  archived_milestones: z.array(item).default([]),
  archived_deliverables: z.array(item).default([]),
  former_members: z
    .array(
      z.object({
        user_id: z.string(),
        email: z.string(),
        role: roleSchema,
        joined_at: z.string(),
        removed_at: z.string(),
      }),
    )
    .default([]),
  objectives: z.array(z.string()),
  objectiveIds: z.array(z.string()).optional(),
  milestones: z.array(item),
  deliverables: z.array(item),
  members: z.array(z.object({ user_id: z.string(), email: z.string(), role: roleSchema })),
  invitations: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      role: roleSchema,
      expires_at: z.string(),
      consumed_at: z.string().nullable(),
      cancelled_at: z.string().nullable(),
    }),
  ),
  proposals: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      structure: structureSchema,
      decision: z.enum(['APPROVE', 'REQUEST_CHANGES', 'REJECT']).nullable(),
      feedback: z.string().nullable(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      actor: z.string(),
      created_at: z.string(),
      details: z.unknown().optional(),
    }),
  ),
});
export const templatesSchema = z.object({
  templates: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      version: z.number(),
      milestones: z.array(z.string()),
    }),
  ),
});
export type ProjectSummary = z.infer<typeof summarySchema>;
export type ProjectDetail = z.infer<typeof detailSchema>;
export const roleLabels = {
  LEAD_AUTHOR: 'Lead Author',
  AUTHOR: 'Author',
  MAIN_REVIEWER: 'Main Reviewer',
  DORMANT_REVIEWER: 'Read-only Reviewer',
};
export const statusLabels = {
  SETUP: 'Getting started',
  PROPOSAL_IN_REVIEW: 'Proposal in review',
  PROPOSAL_CHANGES_REQUESTED: 'Changes requested',
  PROPOSAL_REJECTED: 'Proposal rejected',
  ACTIVE: 'Active',
  FINAL_APPROVAL_PENDING: 'Awaiting final approval',
  COMPLETED: 'Completed',
};
export class ProjectError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function projectRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    method?: 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    csrfToken?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch(`/api/v1/projects${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.csrfToken ? { 'x-csrf-token': options.csrfToken } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const body: unknown = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(body);
    throw new ProjectError(
      response.status,
      response.status >= 500
        ? 'Trace could not complete this request. Please try again.'
        : parsed.success
          ? parsed.data.error.message
          : 'This request could not be completed.',
    );
  }
  return schema.parse(body);
}
export function projectMessage(error: unknown) {
  return error instanceof ProjectError
    ? error.message
    : 'Unable to reach your projects. Please try again.';
}
