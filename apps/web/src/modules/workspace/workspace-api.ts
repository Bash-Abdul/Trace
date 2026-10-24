import { z } from 'zod';

const roleSchema = z.enum(['LEAD_AUTHOR', 'AUTHOR', 'MAIN_REVIEWER', 'DORMANT_REVIEWER']);
const item = z.object({ id: z.string(), title: z.string(), required: z.boolean() });
const progressSchema = z.object({
  milestones: z.array(
    z.object({
      id: z.string(),
      required: z.boolean(),
      state: z.enum(['NOT_STARTED', 'DRAFT', 'AWAITING_REVIEW', 'REVISION_REQUESTED', 'APPROVED']),
      evidence_count: z.number(),
    }),
  ),
  unresolved_feedback: z.number(),
  blocking_feedback: z.number(),
  members: z.array(z.object({ user_id: z.string(), email: z.string() })),
});
export const summarySchema = z.object({
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
  ]),
  version: z.number(),
  template_key: z.string().optional(),
  progress: progressSchema.optional(),
  role: roleSchema,
});
const structureSchema = z.object({
  title: z.string(),
  description: z.string(),
  objectives: z.array(z.string()),
  milestones: z.array(item),
  deliverables: z.array(item),
});
export const detailSchema = summarySchema.extend({
  objectives: z.array(z.string()),
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
    z.object({ id: z.string(), action: z.string(), actor: z.string(), created_at: z.string() }),
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
