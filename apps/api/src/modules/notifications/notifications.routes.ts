import { Router } from 'express';
import { authenticateRead, authenticateMutation } from '../auth/auth.middleware.js';
import { validate } from '../../middleware/validate.js';
import { inboxQuery, notificationParams, readBody, emptyBody } from './notifications.schema.js';
import * as controller from './notifications.controller.js';
export const notificationsRouter = Router();
// Parent Projects router provides browser, origin and rate-limit protections.
notificationsRouter.get('/', validate({ query: inboxQuery }), authenticateRead(controller.list));
notificationsRouter.post(
  '/read-all',
  validate({ body: emptyBody }),
  authenticateMutation(controller.markAll),
);
notificationsRouter.patch(
  '/:notificationId',
  validate({ params: notificationParams, body: readBody }),
  authenticateMutation(controller.mark),
);
