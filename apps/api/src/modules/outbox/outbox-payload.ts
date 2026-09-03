import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { env } from '../../config/index.js';

const algorithm = 'aes-256-gcm';
const initializationVectorLength = 12;
const envelopeVersion = 1;

const encryptionKey = Buffer.from(env.OUTBOX_ENCRYPTION_KEY, 'base64');

/*
 * Additional authenticated data binds this ciphertext to its intended
 * Trace job type and envelope version.
 */
const additionalAuthenticatedData = Buffer.from('trace:outbox:SEND_EMAIL_VERIFICATION:v1', 'utf8');

const encryptedEnvelopeSchema = z
  .object({
    version: z.literal(envelopeVersion),
    initializationVector: z.string().min(1),
    authenticationTag: z.string().min(1),
    ciphertext: z.string().min(1),
  })
  .strict();

export const emailVerificationJobPayloadSchema = z
  .object({
    recipientEmail: z.string().email(),
    verificationToken: z.string().min(1),
  })
  .strict();

export type EmailVerificationJobPayload = z.infer<typeof emailVerificationJobPayloadSchema>;

/*
 * Encrypts the secret email payload using authenticated AES-256-GCM.
 * The returned envelope is safe to store in the outbox table.
 */
export function encryptEmailVerificationPayload(payload: EmailVerificationJobPayload): string {
  const validatedPayload = emailVerificationJobPayloadSchema.parse(payload);

  const serializedPayload = JSON.stringify(validatedPayload);
  const initializationVector = randomBytes(initializationVectorLength);

  const cipher = createCipheriv(algorithm, encryptionKey, initializationVector);

  cipher.setAAD(additionalAuthenticatedData);

  const ciphertext = Buffer.concat([cipher.update(serializedPayload, 'utf8'), cipher.final()]);

  const authenticationTag = cipher.getAuthTag();

  return JSON.stringify({
    version: envelopeVersion,
    initializationVector: initializationVector.toString('base64'),
    authenticationTag: authenticationTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

/*
 * The future email worker will call this before sending the message.
 * Authentication failure causes decryption to throw.
 */
export function decryptEmailVerificationPayload(
  encryptedPayload: string,
): EmailVerificationJobPayload {
  const parsedEnvelope: unknown = JSON.parse(encryptedPayload);
  const envelope = encryptedEnvelopeSchema.parse(parsedEnvelope);

  const decipher = createDecipheriv(
    algorithm,
    encryptionKey,
    Buffer.from(envelope.initializationVector, 'base64'),
  );

  decipher.setAAD(additionalAuthenticatedData);
  decipher.setAuthTag(Buffer.from(envelope.authenticationTag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);

  const parsedPayload: unknown = JSON.parse(plaintext.toString('utf8'));

  return emailVerificationJobPayloadSchema.parse(parsedPayload);
}
