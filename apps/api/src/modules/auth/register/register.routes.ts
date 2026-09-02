import { Router } from 'express';

import { validate } from '../../../middleware/validate.js';
import { registerController } from './register.controller.js';
import { registerSchema } from './register.schema.js';

export const registerRouter = Router();

registerRouter.post(
  '/register',
  validate({
    body: registerSchema,
  }),
  registerController,
);
