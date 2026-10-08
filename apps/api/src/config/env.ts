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
  APP_ORIGIN: z
    .string()
    .url()
    .default('http://localhost:3000')
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
    }, 'APP_ORIGIN must be an HTTP(S) origin without a path'),
  INVITATION_TTL_SECONDS: z.coerce.number().int().min(60).max(2592000).default(604800),
  SESSION_IDLE_SECONDS: z.coerce.number().int().min(60).max(86400).default(1800),
  SESSION_ABSOLUTE_SECONDS: z.coerce.number().int().min(60).max(2592000).default(604800),
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

  if (result.data.SESSION_IDLE_SECONDS > result.data.SESSION_ABSOLUTE_SECONDS) {
    throw new Error('Session idle lifetime must not exceed absolute lifetime');
  }
  if (
    result.data.NODE_ENV === 'production' &&
    (!input.APP_ORIGIN || !result.data.APP_ORIGIN.startsWith('https:'))
  ) {
    throw new Error('Production requires an explicit HTTPS APP_ORIGIN');
  }
  return Object.freeze(result.data);
}
