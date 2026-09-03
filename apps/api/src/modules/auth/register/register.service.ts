import { withTransaction } from '../../../config/db.js';
import { createOutboxJob } from '../../outbox/outbox.repository.js';
import { encryptEmailVerificationPayload } from '../../outbox/outbox-payload.js';
import { generateOpaqueToken, hashOpaqueToken, hashPassword } from '../auth-crypto/auth-crypto.js';
import { createEmailVerificationToken, createUser } from './register.repository.js';
import type { RegisterSchema } from './register.schema.js';

const verificationTokenLifetimeMs = 24 * 60 * 60 * 1000;

export type RegisterUserResult =
  | {
      created: true;
      userId: string;
    }
  | {
      created: false;
    };

export async function registerUser(input: RegisterSchema): Promise<RegisterUserResult> {
  const { email, password } = input;

  /*
   * Perform expensive cryptographic work before opening the transaction.
   * This keeps the database transaction short.
   */
  const passwordHash = await hashPassword(password);

  const verificationToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(verificationToken);
  const expiresAt = new Date(Date.now() + verificationTokenLifetimeMs);

  /*
   * Encrypt the raw token before it enters PostgreSQL.
   * The authentication table still receives only its SHA-256 hash.
   */
  const encryptedPayload = encryptEmailVerificationPayload({
    recipientEmail: email,
    verificationToken,
  });

  return withTransaction(async (client) => {
    const userId = await createUser(client, {
      email,
      passwordHash,
    });

    if (userId === null) {
      return {
        created: false,
      };
    }

    const verificationTokenId = await createEmailVerificationToken(client, {
      userId,
      tokenHash,
      expiresAt,
    });

    const outboxJobId = await createOutboxJob(client, {
      jobType: 'SEND_EMAIL_VERIFICATION',
      encryptedPayload,
      idempotencyKey: `email-verification:${verificationTokenId}`,
    });

    /*
     * A newly created token ID should always create a new outbox job.
     * If it doesn't, roll back the whole registration transaction.
     */
    if (outboxJobId === null) {
      throw new Error('Verification email outbox job already exists');
    }

    return {
      created: true,
      userId,
    };
  });
}
