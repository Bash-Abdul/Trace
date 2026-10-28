import { z } from 'zod';
export const inboxQuery = z.object({ before: z.uuid().optional() }).strict();
export const notificationParams = z.object({ notificationId: z.uuid() });
export const readBody = z.object({ read: z.boolean() }).strict();
export const emptyBody = z.object({}).strict();
