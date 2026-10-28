import type { ProjectDetailResponse } from '../projects/projects.types.js';
import type {
  Submission,
  Feedback,
  FeedbackMessage,
  Evidence,
} from '../milestones/milestones.types.js';
import type { Submission as DeliverableSubmission } from '../deliverables/deliverables.types.js';
import type { Change } from '../changes/changes.types.js';
import type { Check, FinalRequest } from '../final-approval/final-approval.types.js';
export interface Records {
  events: ProjectDetailResponse['events'];
  submissions: (Submission & { milestone_id: string })[];
  deliverables: (DeliverableSubmission & { deliverable_id: string })[];
  feedback: Feedback[];
  messages: FeedbackMessage[];
  changes: Change[];
}
export interface Manifest {
  schemaVersion: number;
  project: ProjectDetailResponse;
  finalRequest: FinalRequest;
  records?: Records;
  history: {
    milestoneVersionIds: string[];
    deliverableVersionIds: string[];
    feedback: Feedback[];
    feedbackMessageIds: string[];
    changeIds: string[];
  };
}
export interface Portfolio {
  checklist: Check[];
  mode: 'LIVE' | 'FINAL';
  recordedAt: string | null;
  project: ProjectDetailResponse;
  records: Records;
  drafts: (Evidence & { milestone_id: string })[];
  finalRequest: FinalRequest | null;
}
