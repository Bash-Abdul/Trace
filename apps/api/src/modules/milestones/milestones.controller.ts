import type { AuthenticatedHandler, MutationHandler } from '../auth/auth.types.js';
import * as service from './milestones.service.js';
import type {
  Decision,
  Detail,
  Draft,
  FeedbackParams,
  FeedbackUpdate,
  MilestoneParams,
  NewFeedback,
  ReviewParams,
} from './milestones.types.js';

export const read: AuthenticatedHandler<MilestoneParams, unknown, Detail> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.read(request.params, auth.userId),
});

export const saveDraft: MutationHandler<MilestoneParams, Draft, Detail> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.saveDraft(auth.db, request.params, auth.userId, request.body),
});

export const submit: MutationHandler<MilestoneParams, { version: number }, Detail> = async (
  request,
  auth,
) => ({
  status: 201,
  body: await service.submit(auth.db, request.params, auth.userId, request.body.version),
});

export const decide: MutationHandler<ReviewParams, Decision, Detail> = async (request, auth) => ({
  status: 200,
  body: await service.decide(
    auth.db,
    request.params,
    request.params.submissionId,
    auth.userId,
    request.body,
  ),
});

export const addFeedback: MutationHandler<ReviewParams, NewFeedback, Detail> = async (
  request,
  auth,
) => ({
  status: 201,
  body: await service.addFeedback(
    auth.db,
    request.params,
    request.params.submissionId,
    auth.userId,
    request.body,
  ),
});

export const updateFeedback: MutationHandler<FeedbackParams, FeedbackUpdate, Detail> = async (
  request,
  auth,
) => ({
  status: 200,
  body: await service.updateFeedback(
    auth.db,
    request.params,
    request.params.feedbackId,
    auth.userId,
    request.body,
  ),
});

export const notifications: AuthenticatedHandler<
  { projectId: string },
  unknown,
  Awaited<ReturnType<typeof service.notifications>>
> = async (request, auth) => ({
  status: 200,
  body: await service.notifications(auth.db, request.params.projectId, auth.userId),
});
