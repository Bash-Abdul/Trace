import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticateRead, authenticateMutation } from '../auth/auth.middleware.js';
import * as controller from './deliverables.controller.js';
import { paramsSchema, draftSchema, versionSchema } from './deliverables.schema.js';
export const deliverablesRouter = Router({ mergeParams: true });
deliverablesRouter.get('/', validate({ params: paramsSchema }), authenticateRead(controller.read));
deliverablesRouter.patch(
  '/draft',
  validate({ params: paramsSchema, body: draftSchema }),
  authenticateMutation(controller.saveDraft),
);
deliverablesRouter.post(
  '/submissions',
  validate({ params: paramsSchema, body: versionSchema }),
  authenticateMutation(controller.submit),
);
deliverablesRouter.post(
  '/revision',
  validate({ params: paramsSchema, body: versionSchema }),
  authenticateMutation(controller.revise),
);
