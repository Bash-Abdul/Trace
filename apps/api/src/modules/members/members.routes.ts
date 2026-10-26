import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticateMutation } from '../auth/auth.middleware.js';
import { memberParams, membershipAction } from './members.schema.js';
import * as controller from './members.controller.js';
export const membersRouter = Router({ mergeParams: true });
membersRouter.post(
  '/:userId/remove',
  validate({ params: memberParams, body: membershipAction }),
  authenticateMutation(controller.remove),
);
membersRouter.post(
  '/:userId/transfer-lead',
  validate({ params: memberParams, body: membershipAction }),
  authenticateMutation(controller.transferLead),
);
