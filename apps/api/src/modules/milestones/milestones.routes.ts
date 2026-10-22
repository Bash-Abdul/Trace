import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticateRead, authenticateMutation } from '../auth/auth.middleware.js';
import * as controller from './milestones.controller.js';
import * as schema from './milestones.schema.js';

export const milestonesRouter = Router({ mergeParams: true });

milestonesRouter.get(
  '/',
  validate({ params: schema.milestoneParams }),
  authenticateRead(controller.read),
);
milestonesRouter.patch(
  '/draft',
  validate({ params: schema.milestoneParams, body: schema.draftSchema }),
  authenticateMutation(controller.saveDraft),
);
milestonesRouter.post(
  '/submissions',
  validate({ params: schema.milestoneParams, body: schema.versionSchema }),
  authenticateMutation(controller.submit),
);
milestonesRouter.post(
  '/submissions/:submissionId/decision',
  validate({ params: schema.reviewParams, body: schema.decisionSchema }),
  authenticateMutation(controller.decide),
);
milestonesRouter.post(
  '/submissions/:submissionId/feedback',
  validate({ params: schema.reviewParams, body: schema.feedbackSchema }),
  authenticateMutation(controller.addFeedback),
);
milestonesRouter.patch(
  '/feedback/:feedbackId',
  validate({ params: schema.feedbackParams, body: schema.feedbackUpdateSchema }),
  authenticateMutation(controller.updateFeedback),
);
