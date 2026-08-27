import { createHash, randomBytes } from 'node:crypto';

import * as argon2 from 'argon2';

/*
 * These are OWASP's current minimum Argon2id settings.
 * We will benchmark them against the eventual deployment environment before release.
 */
const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const opaqueTokenBytes = 32;

/*
 * Argon2 generates a unique random salt automatically and includes the salt,
 * algorithm and cost parameters in the returned encoded hash.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, passwordHashOptions);
}

/*
 * The library extracts the salt and parameters from the encoded stored hash.
 * Password input is checked exactly as supplied; it is never trimmed or normalized.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}

/*
 * The raw token is safe to send to the browser or email recipient.
 * It must never be persisted or logged.
 */
export function generateOpaqueToken(): string {
  return randomBytes(opaqueTokenBytes).toString('base64url');
}

/*
 * Random tokens already contain high entropy, so fast SHA-256 is appropriate.
 * Passwords instead require the deliberately expensive Argon2id function.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
