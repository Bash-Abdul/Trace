import { withTransaction } from '../../../config/db.js';
import { generateOpaqueToken, hashOpaqueToken, hashPassword } from '../auth-crypto/auth-crypto.js';
import { createEmailVerificationToken, createUser } from './register.repository.js';
import type { RegisterSchema } from './register.schema.js';

const verificationTokenLifetimeMs = 24 * 60 * 60 * 1000;

export type RegisterUserResult =
  | {
      created: true;
      userId: string;
      email: string;
      verificationToken: string;
    }
  | {
      created: false;
    };

export async function registerUser(input: RegisterSchema): Promise<RegisterUserResult> {
  const { email, password } = input;

  // Password hashing is deliberately slow, so do it before opening a transaction.
  const passwordHash = await hashPassword(password);

  // Only the token hash is stored. The raw token will later be emailed.
  const verificationToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(verificationToken);
  const expiresAt = new Date(Date.now() + verificationTokenLifetimeMs);

  return withTransaction(async (client) => {
    const userId = await createUser(client, {
      email,
      passwordHash,
    });

    // The repository returns null when the email already exists.
    if (userId === null) {
      return {
        created: false,
      };
    }

    await createEmailVerificationToken(client, {
      userId,
      tokenHash,
      expiresAt,
    });

    return {
      created: true,
      userId,
      email,
      verificationToken,
    };
  });
}
