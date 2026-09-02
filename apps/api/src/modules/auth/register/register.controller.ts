import type { RequestHandler } from 'express';

import type { RegisterSchema } from './register.schema.js';
import { registerUser } from './register.service.js';

interface RegisterResponse {
  message: string;
}

export const registerController: RequestHandler<
  Record<string, never>,
  RegisterResponse,
  RegisterSchema
> = async (request, response) => {
  /*
   * validate() has already validated and transformed request.body,
   * so the controller can pass it directly to the service.
   */
  await registerUser(request.body);

  /*
   * The response is intentionally identical for new and existing emails.
   */
  response.status(202).json({
    message: 'If registration can be completed, check your email for verification instructions.',
  });
};
