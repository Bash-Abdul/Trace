import { describe, expect, it } from 'vitest';

import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from './auth-crypto.js';

describe('authentication cryptography', () => {
  describe('password hashing', () => {
    it('creates an Argon2id hash that verifies the original password', async () => {
      const password = 'A strong example password';
      const passwordHash = await hashPassword(password);

      expect(passwordHash).toMatch(/^\$argon2id\$/);
      expect(passwordHash).not.toContain(password);
      await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await hashPassword('Correct password');

      await expect(verifyPassword(passwordHash, 'Incorrect password')).resolves.toBe(false);
    });

    it('does not trim or otherwise alter passwords', async () => {
      const passwordHash = await hashPassword(' password with spaces ');

      await expect(verifyPassword(passwordHash, ' password with spaces ')).resolves.toBe(true);

      await expect(verifyPassword(passwordHash, 'password with spaces')).resolves.toBe(false);
    });

    it('produces different hashes for the same password', async () => {
      const firstHash = await hashPassword('Same password');
      const secondHash = await hashPassword('Same password');

      // Argon2 generates a different random salt for every hash.
      expect(firstHash).not.toBe(secondHash);
    });
  });

  describe('opaque tokens', () => {
    it('generates distinct URL-safe random tokens', () => {
      const firstToken = generateOpaqueToken();
      const secondToken = generateOpaqueToken();

      expect(firstToken).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(firstToken).not.toBe(secondToken);
    });

    it('creates a deterministic 64-character SHA-256 hash', () => {
      const token = generateOpaqueToken();
      const firstHash = hashOpaqueToken(token);
      const secondHash = hashOpaqueToken(token);

      expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
      expect(firstHash).toBe(secondHash);
      expect(firstHash).not.toContain(token);
    });
  });
});
