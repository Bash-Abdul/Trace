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
const outboxEncryptionKeySchema = z
  .string()
  .min(1, 'OUTBOX_ENCRYPTION_KEY is required')
  .refine((value) => {
    const decodedKey = Buffer.from(value, 'base64');

    /*
     * AES-256 requires exactly 32 bytes.
     * Comparing the encoded result also rejects malformed Base64.
     */
    return decodedKey.length === 32 && decodedKey.toString('base64') === value;
  }, 'OUTBOX_ENCRYPTION_KEY must be a Base64-encoded 32-byte key');

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  DATABASE_URL: databaseUrlSchema,

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  TEST_DATABASE_URL: databaseUrlSchema.optional(),

  OUTBOX_ENCRYPTION_KEY: outboxEncryptionKeySchema,
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
