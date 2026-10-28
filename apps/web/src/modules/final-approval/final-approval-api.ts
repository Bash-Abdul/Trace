import { z } from 'zod';
const check = z.object({
  key: z.string(),
  label: z.string(),
  satisfied: z.boolean(),
  outstanding: z.array(z.string()),
});
export const finalSchema = z.object({
  version: z.number(),
  status: z.string(),
  eligible: z.boolean(),
  checklist: z.array(check),
  requests: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      state: z.enum(['PENDING', 'APPROVED', 'REVISION_REQUESTED', 'INVALIDATED', 'WITHDRAWN']),
      requested_at: z.string(),
      decided_at: z.string().nullable(),
      feedback: z.string().nullable(),
      snapshot: z.object({ checklist: z.array(check) }),
    }),
  ),
});
export type FinalApproval = z.infer<typeof finalSchema>;
