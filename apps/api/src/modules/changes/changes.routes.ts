import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticateRead, authenticateMutation } from '../auth/auth.middleware.js';
import * as controller from './changes.controller.js';
import {
  paramsSchema,
  changeParamsSchema,
  changeSchema,
  minorSchema,
  actionSchema,
  decisionSchema,
} from './changes.schema.js';
export const changesRouter = Router({ mergeParams: true });
changesRouter.get('/', validate({ params: paramsSchema }), authenticateRead(controller.list));
changesRouter.post(
  '/minor',
  validate({ params: paramsSchema, body: minorSchema }),
  authenticateMutation(controller.minor),
);
changesRouter.post(
  '/',
  validate({ params: paramsSchema, body: changeSchema }),
  authenticateMutation(controller.create),
);
changesRouter.patch(
  '/:changeId',
  validate({ params: changeParamsSchema, body: changeSchema }),
  authenticateMutation(controller.edit),
);
changesRouter.post(
  '/:changeId/submit',
  validate({ params: changeParamsSchema, body: actionSchema }),
  authenticateMutation(controller.submit),
);
changesRouter.post(
  '/:changeId/withdraw',
  validate({ params: changeParamsSchema, body: actionSchema }),
  authenticateMutation(controller.withdraw),
);
changesRouter.post(
  '/:changeId/decision',
  validate({ params: changeParamsSchema, body: decisionSchema }),
  authenticateMutation(controller.decide),
);
