import type { z } from 'zod';
import type {
  draftSchema,
  decisionSchema,
  feedbackSchema,
  feedbackUpdateSchema,
  milestoneParams,
  reviewParams,
  feedbackParams,
} from './milestones.schema.js';

export type MilestoneParams = z.infer<typeof milestoneParams>;
export type ReviewParams = z.infer<typeof reviewParams>;
export type FeedbackParams = z.infer<typeof feedbackParams>;
export type Draft = z.infer<typeof draftSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type NewFeedback = z.infer<typeof feedbackSchema>;
export type FeedbackUpdate = z.infer<typeof feedbackUpdateSchema>;
export type State = 'NOT_STARTED' | 'DRAFT' | 'AWAITING_REVIEW' | 'REVISION_REQUESTED' | 'APPROVED';
export interface Evidence {
  id: string;
  title: string;
  kind: 'TEXT' | 'LINK';
  content: string;
  created_by: string;
  updated_by: string;
}
export interface Submission {
  id: string;
  number: number;
  evidence: Evidence[];
  submitted_by: string;
  submitted_at: Date;
  decision: Decision['decision'] | null;
  feedback: string | null;
  decided_by: string | null;
  decided_at: Date | null;
}
export interface Feedback {
  id: string;
  submission_version_id: string;
  body: string;
  blocking: boolean;
  state: 'OPEN' | 'ADDRESSED_BY_AUTHOR' | 'RESOLVED_BY_REVIEWER';
  version: number;
  created_by: string;
  created_at: Date;
}
export interface FeedbackMessage {
  id: string;
  feedback_id: string;
  author_id: string;
  body: string;
  created_at: Date;
}
export interface Detail {
  milestone: { id: string; title: string; required: boolean; archived_at: Date | null };
  version: number;
  state: State;
  evidence: Evidence[];
  submissions: Submission[];
  feedback: Feedback[];
  messages: FeedbackMessage[];
}
