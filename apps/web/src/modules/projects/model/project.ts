import { z } from 'zod';

export const milestoneStatus = z.enum([
  'not-started',
  'draft',
  'awaiting-review',
  'revision-requested',
  'approved',
]);
const evidenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['document', 'link', 'note']),
  detail: z.string(),
  url: z.string().optional(),
});
const feedbackSchema = z.object({
  id: z.string(),
  milestoneId: z.string(),
  author: z.string(),
  body: z.string(),
  blocking: z.boolean(),
  status: z.enum(['open', 'addressed', 'resolved']),
  reply: z.string(),
});
const milestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  due: z.string(),
  required: z.boolean(),
  status: milestoneStatus,
  version: z.number(),
  summary: z.string(),
  evidence: z.array(evidenceSchema),
  history: z.array(
    z.object({
      version: z.number(),
      summary: z.string(),
      evidence: z.array(evidenceSchema),
      decision: z.string(),
    }),
  ),
});
export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  code: z.string(),
  color: z.enum(['sage', 'peach', 'blue', 'lilac']),
  state: z.enum(['setup', 'proposal-review', 'active', 'final-review', 'completed']),
  route: z.enum(['in-platform', 'external']),
  reviewerJoined: z.boolean(),
  reviewerEmail: z.string(),
  due: z.string(),
  updated: z.string(),
  objectives: z.array(z.string()),
  milestones: z.array(milestoneSchema),
  feedback: z.array(feedbackSchema),
  deliverables: z.array(z.object({ id: z.string(), title: z.string(), submitted: z.boolean() })),
  activity: z.array(
    z.object({
      id: z.string(),
      actor: z.string(),
      action: z.string(),
      detail: z.string(),
      date: z.string(),
    }),
  ),
});
export type Project = z.infer<typeof projectSchema>;
export type Milestone = Project['milestones'][number];
export type Evidence = z.infer<typeof evidenceSchema>;
export type Persona = 'author' | 'reviewer';
export const personaNames = { author: 'Bashir Abdul', reviewer: 'Dr. Maya Patel' };
export const statusLabels: Record<Milestone['status'], string> = {
  'not-started': 'Not started',
  draft: 'In progress',
  'awaiting-review': 'Awaiting review',
  'revision-requested': 'Changes requested',
  approved: 'Approved',
};
export function completionChecks(project: Project) {
  return [
    {
      label: 'All required milestones approved',
      done: project.milestones.filter((m) => m.required).every((m) => m.status === 'approved'),
    },
    {
      label: 'Required deliverables submitted',
      done: project.deliverables.every((d) => d.submitted),
    },
    {
      label: 'Blocking feedback resolved',
      done: project.feedback.filter((f) => f.blocking).every((f) => f.status === 'resolved'),
    },
  ];
}
