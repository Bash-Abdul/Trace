import pino from 'pino';

import { env } from '../config/index.js';

const sensitivePaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers.referer',
  'res.headers["set-cookie"]',

  'password',
  '*.password',

  'token',
  '*.token',

  'sessionToken',
  '*.sessionToken',

  'verificationToken',
  '*.verificationToken',

  'resetToken',
  '*.resetToken',

  'csrfToken',
  '*.csrfToken',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: sensitivePaths,
    censor: '[REDACTED]',
  },
});
