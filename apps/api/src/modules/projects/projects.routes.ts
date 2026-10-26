import { coverageRouter } from '../evidence-coverage/coverage.routes.js';
import { membersRouter } from '../members/members.routes.js';
import { changesRouter } from '../changes/changes.routes.js';
import { notificationsRouter } from '../notifications/notifications.routes.js';
import { reviewsRouter } from '../reviews/reviews.routes.js';
import { notifications } from '../milestones/milestones.controller.js';
import { notificationParams } from '../milestones/milestones.schema.js';
import { milestonesRouter } from '../milestones/milestones.routes.js';
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  authBrowserControls,
  authenticateRead,
  authenticateMutation,
  authRateLimit,
  requireMutationOrigin,
} from '../auth/auth.middleware.js';
import * as controller from './projects.controller.js';
import {
  createProjectSchema,
  decisionSchema,
  draftSchema,
  invitationSchema,
  tokenSchema,
  versionSchema,
  projectParamsSchema,
  invitationParamsSchema,
  proposalParamsSchema,
} from './projects.schema.js';

export const projectsRouter = Router();
projectsRouter.use(authBrowserControls, authRateLimit);
projectsRouter.use((request, response, next) => {
  if (request.method === 'GET') return next();
  return requireMutationOrigin(request, response, next);
});
projectsRouter.use('/reviews', reviewsRouter);
projectsRouter.use('/notifications', notificationsRouter);
projectsRouter.get('/templates', authenticateRead(controller.listTemplates));
projectsRouter.get('/', authenticateRead(controller.listProjects));
projectsRouter.post(
  '/',
  validate({ body: createProjectSchema }),
  authenticateMutation(controller.createProject),
);
projectsRouter.post(
  '/invitations/accept',
  validate({ body: tokenSchema }),
  authenticateMutation(controller.acceptInvitation),
);
projectsRouter.get(
  '/:id',
  validate({ params: projectParamsSchema }),
  authenticateRead(controller.getProject),
);
projectsRouter.patch(
  '/:id',
  validate({ params: projectParamsSchema, body: draftSchema }),
  authenticateMutation(controller.updateDraft),
);
projectsRouter.post(
  '/:id/invitations',
  validate({ params: projectParamsSchema, body: invitationSchema }),
  authenticateMutation(controller.invite),
);
projectsRouter.delete(
  '/:id/invitations/:invitationId',
  validate({ params: invitationParamsSchema }),
  authenticateMutation(controller.cancelInvitation),
);
projectsRouter.post(
  '/:id/proposals',
  validate({ params: projectParamsSchema, body: versionSchema }),
  authenticateMutation(controller.submitProposal),
);
projectsRouter.post(
  '/:id/proposals/:proposalId/decision',
  validate({ params: proposalParamsSchema, body: decisionSchema }),
  authenticateMutation(controller.decideProposal),
);

projectsRouter.use('/:projectId/milestones/:milestoneId', milestonesRouter);

projectsRouter.get(
  '/:projectId/notifications',
  validate({ params: notificationParams }),
  authenticateRead(notifications),
);

projectsRouter.use('/:projectId/changes', changesRouter);

projectsRouter.use('/:projectId/members', membersRouter);

projectsRouter.use('/:projectId/coverage', coverageRouter);
