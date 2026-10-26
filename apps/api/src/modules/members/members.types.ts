import type { z } from 'zod';
import type { memberParams, membershipAction } from './members.schema.js';
import type { Role } from '../projects/projects.types.js';
export type MemberParams = z.infer<typeof memberParams>;
export type MembershipAction = z.infer<typeof membershipAction>;
export interface Membership {
  user_id: string;
  role: Role;
  joined_at: Date;
}
