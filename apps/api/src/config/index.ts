import 'dotenv/config';

import { parseEnvironment } from './env.js';

export const env = parseEnvironment(process.env);
