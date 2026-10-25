import { z } from 'zod';
import { structureSchema } from '../workspace/workspace-api';
export const changeSchema = z.object({
  id: z.string(),
  version: z.number(),
  state: z.enum(['DRAFT', 'PROPOSED', 'APPROVED_AND_APPLIED', 'REJECTED', 'WITHDRAWN']),
  reason: z.string(),
  before_structure: structureSchema,
  after_structure: structureSchema,
  created_at: z.string(),
  feedback: z.string().nullable(),
});
export type Change = z.infer<typeof changeSchema>;
export const changeLabels = {
  DRAFT: 'Draft',
  PROPOSED: 'Awaiting Reviewer',
  APPROVED_AND_APPLIED: 'Approved and applied',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};
