import { Router } from 'express';
import { authenticateRead } from '../auth/auth.middleware.js';
import { validate } from '../../middleware/validate.js';
import { paramsSchema } from './coverage.schema.js';
import { getCoverage } from './coverage.controller.js';
export const coverageRouter = Router({ mergeParams: true });
coverageRouter.get('/', validate({ params: paramsSchema }), authenticateRead(getCoverage));
