import type { z } from 'zod';
import type { requestSchema, decisionSchema } from './final-approval.schema.js';
import type { ProjectDetailResponse } from '../projects/projects.types.js';
export type RequestInput = z.infer<typeof requestSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export interface Check {
  key: string;
  label: string;
  satisfied: boolean;
  outstanding: string[];
}
export interface Snapshot {
  plan: Pick<
    ProjectDetailResponse,
    | 'title'
    | 'description'
    | 'objectives'
    | 'objectiveIds'
    | 'milestones'
    | 'deliverables'
    | 'dueDate'
    | 'timezone'
    | 'template_key'
    | 'template_version'
  >;
  milestoneApprovals: { milestoneId: string; submissionId: string }[];
  deliverableVersions: { deliverableId: string; submissionId: string }[];
  reviewerId: string | null;
  checklist: Check[];
}
export interface FinalRequest {
  id: string;
  project_id: string;
  number: number;
  state: 'PENDING' | 'APPROVED' | 'REVISION_REQUESTED' | 'INVALIDATED' | 'WITHDRAWN';
  base_version: number;
  snapshot: Snapshot;
  requested_by: string;
  requested_at: Date;
  request_key: string;
  decision_key: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  feedback: string | null;
}
export interface Detail {
  version: number;
  status: string;
  eligible: boolean;
  checklist: Check[];
  requests: FinalRequest[];
}
