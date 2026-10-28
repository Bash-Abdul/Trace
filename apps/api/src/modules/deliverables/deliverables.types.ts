import type { z } from 'zod';
import type { paramsSchema, draftSchema } from './deliverables.schema.js';
export type Params = z.infer<typeof paramsSchema>;
export type DraftInput = z.infer<typeof draftSchema>;
export interface Requirement {
  id: string;
  title: string;
  required: boolean;
  archived_at: Date | null;
}
export interface Draft {
  version: number;
  state: 'DRAFT' | 'SUBMITTED';
  kind: 'TEXT' | 'LINK';
  content: string;
  note: string;
  created_by: string;
  updated_by: string;
  updated_at: Date;
}
export interface Submission extends Omit<Draft, 'version' | 'state' | 'updated_at'> {
  id: string;
  number: number;
  title: string;
  required: boolean;
  submitted_by: string;
  submitted_at: Date;
}
export interface Detail {
  deliverable: Requirement;
  version: number;
  state: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED';
  draft: Draft | null;
  submissions: Submission[];
  currentSubmissionId: string | null;
}
