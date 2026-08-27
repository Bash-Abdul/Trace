import { z } from 'zod';

const databaseUrlSchema = z
  .string()
  .min(1, 'DATABASE_URL is required')
  .refine((value) => {
    try {
      const url = new URL(value);

      return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
    } catch {
      return false;
    }
  }, 'DATABASE_URL must be a valid PostgreSQL connection URL');

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  DATABASE_URL: databaseUrlSchema,

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  TEST_DATABASE_URL: databaseUrlSchema.optional(),
});

export type Environment = Readonly<z.infer<typeof environmentSchema>>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const field = issue.path.join('.') || 'environment';

        return `${field}: ${issue.message}`;
      })
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return Object.freeze(result.data);
}
