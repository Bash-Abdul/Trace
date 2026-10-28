import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authenticateRead } from '../auth/auth.middleware.js';
import { paramsSchema } from './portfolio.schema.js';
import { read } from './portfolio.controller.js';
export const portfolioRouter = Router({ mergeParams: true });
portfolioRouter.get('/', validate({ params: paramsSchema }), authenticateRead(read));
