import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticateRead, authenticateMutation } from '../auth/auth.middleware.js';
import * as controller from './final-approval.controller.js';
import {
  paramsSchema,
  decisionParamsSchema,
  requestSchema,
  decisionSchema,
} from './final-approval.schema.js';
export const finalApprovalRouter = Router({ mergeParams: true });
finalApprovalRouter.get('/', validate({ params: paramsSchema }), authenticateRead(controller.read));
finalApprovalRouter.post(
  '/',
  validate({ params: paramsSchema, body: requestSchema }),
  authenticateMutation(controller.create),
);
finalApprovalRouter.post(
  '/:requestId/decision',
  validate({ params: decisionParamsSchema, body: decisionSchema }),
  authenticateMutation(controller.decide),
);
finalApprovalRouter.post(
  '/:requestId/withdraw',
  validate({ params: decisionParamsSchema }),
  authenticateMutation(controller.withdraw),
);
