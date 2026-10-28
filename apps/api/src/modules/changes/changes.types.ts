import type { z } from 'zod';
import type { changeSchema, minorSchema, decisionSchema } from './changes.schema.js';
import type { ProposalSnapshot } from '../projects/projects.types.js';
export type ChangeInput = z.infer<typeof changeSchema>;
export type MinorInput = z.infer<typeof minorSchema>;
export type ChangeDecision = z.infer<typeof decisionSchema>;
export type ChangeState = 'DRAFT' | 'PROPOSED' | 'APPROVED_AND_APPLIED' | 'REJECTED' | 'WITHDRAWN';
export interface Change {
  id: string;
  project_id: string;
  version: number;
  state: ChangeState;
  reason: string;
  before_structure: ProposalSnapshot;
  after_structure: ProposalSnapshot;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  submitted_by: string | null;
  submitted_at: Date | null;
  decided_by: string | null;
  decided_at: Date | null;
  feedback: string | null;
}
export type Params = { projectId: string };
export type ChangeParams = Params & { changeId: string };
