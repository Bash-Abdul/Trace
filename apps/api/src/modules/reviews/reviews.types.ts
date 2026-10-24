import type { Role } from '../projects/projects.types.js';
export interface QueueRecord {
  id: string;
  project_id: string;
  project_title: string;
  role: Role;
  milestone_id: string | null;
  milestone_title: string | null;
  number: number;
  state: string;
  body: string | null;
  blocking: boolean;
  updated_at: Date;
}
export type QueueKind = 'PROPOSAL' | 'MILESTONE_SUBMISSION' | 'MILESTONE_FEEDBACK';
export interface QueueItem extends QueueRecord {
  kind: QueueKind;
  perspective: 'author' | 'reviewer';
  needs_attention: boolean;
  action: string;
}
export interface ReviewQueue {
  items: QueueItem[];
  truncated: boolean;
}
