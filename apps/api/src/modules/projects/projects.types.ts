import type { z } from 'zod';
import type {
  createProjectSchema,
  draftSchema,
  invitationSchema,
  decisionSchema,
  tokenSchema,
  versionSchema,
} from './projects.schema.js';

export type CreateProject = z.infer<typeof createProjectSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type InvitationAcceptance = z.infer<typeof tokenSchema>;
export type VersionInput = z.infer<typeof versionSchema>;
export type ProjectParams = { id: string };
export type InvitationParams = ProjectParams & { invitationId: string };
export type ProposalParams = ProjectParams & { proposalId: string };
export type Role = 'LEAD_AUTHOR' | 'AUTHOR' | 'MAIN_REVIEWER' | 'DORMANT_REVIEWER';
export type ProjectStatus =
  'SETUP' | 'PROPOSAL_IN_REVIEW' | 'PROPOSAL_CHANGES_REQUESTED' | 'PROPOSAL_REJECTED' | 'ACTIVE';
export interface ProjectRecord {
  id: string;
  created_by_user_id: string;
  template_key: string;
  template_version: number;
  created_at: Date;
  updated_at: Date;
  activated_at: Date | null;
  activated_version: number | null;
  title: string;
  description: string;
  project_type: 'INDIVIDUAL' | 'GROUP';
  approval_route: 'IN_PLATFORM_PROPOSAL' | 'EXTERNALLY_APPROVED';
  status: ProjectStatus;
  version: number;
}
export interface MemberProject extends ProjectRecord {
  role: Role;
}
export interface ProjectMember {
  user_id: string;
  email: string;
  role: Role;
}
export interface StructureItem {
  id: string;
  title: string;
  required: boolean;
}
export interface ProjectStructure {
  objectives: string[];
  milestones: StructureItem[];
  deliverables: StructureItem[];
}
export interface ProposalSnapshot extends ProjectStructure {
  title: string;
  description: string;
}
export interface InvitationRecord {
  id: string;
  email: string;
  role: Invitation['role'];
  expires_at: Date;
  consumed_at: Date | null;
  cancelled_at: Date | null;
}
export interface PendingInvitation {
  id: string;
  email: string;
  role: Invitation['role'];
  invited_by_user_id: string;
}
export interface ProposalRecord {
  id: string;
  version: number;
  structure: ProposalSnapshot;
  submitted_at: Date;
  submitted_by_user_id: string;
  decision: Decision['decision'] | null;
  feedback: string | null;
  decided_at: Date | null;
  decided_by_user_id: string | null;
}
export interface ProjectEvent {
  id: string;
  action: string;
  details: unknown;
  created_at: Date;
  actor: string;
}
export interface ProjectDetail extends MemberProject, ProjectStructure {
  members: ProjectMember[];
  invitations: InvitationRecord[];
  proposals: ProposalRecord[];
  events: ProjectEvent[];
}

// PostgreSQL JSON aggregation serializes timestamps to strings, matching the wire contract.
type JsonResponse<T> = T extends Date
  ? string
  : T extends (infer Item)[]
    ? JsonResponse<Item>[]
    : T extends object
      ? { [Key in keyof T]: JsonResponse<T[Key]> }
      : T;
export type ProjectDetailResponse = JsonResponse<ProjectDetail>;
export interface CreatedInvitation {
  id: string;
  expires_at: Date;
}
export interface InvitationResponse extends CreatedInvitation {
  invitationUrl: string;
}
export type SavedStructure = Omit<Draft, 'version' | 'milestones' | 'deliverables'> & {
  milestones: StructureItem[];
  deliverables: StructureItem[];
};
export interface VerifiedAccount {
  email: string;
  email_verified_at: Date | null;
}
