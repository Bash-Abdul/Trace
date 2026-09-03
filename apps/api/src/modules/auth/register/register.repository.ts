import type { PoolClient } from 'pg';

interface CreateUserInput {
  email: string;
  passwordHash: string;
}

interface CreateVerificationTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

// INsert a new user into db
export async function createUser(
  client: PoolClient,
  input: CreateUserInput,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id`,
    [input.email, input.passwordHash],
  );
  return result.rows[0]?.id ?? null;
}

/*
 * Stores the hash of the verification token.
 * The raw token must never be saved in PostgreSQL.
 */
export async function createEmailVerificationToken(
  client: PoolClient,
  input: CreateVerificationTokenInput,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO auth_action_tokens (
        user_id,
        purpose,
        token_hash,
        expires_at
      )
      VALUES ($1, 'EMAIL_VERIFICATION', $2, $3)
      RETURNING id
    `,
    [input.userId, input.tokenHash, input.expiresAt],
  );

  const tokenId = result.rows[0]?.id;

  /*
   * A successful INSERT ... RETURNING must produce one row.
   * Missing it indicates an unexpected database result.
   */
  if (tokenId === undefined) {
    throw new Error('Email verification token insert returned no ID');
  }

  return tokenId;
}
