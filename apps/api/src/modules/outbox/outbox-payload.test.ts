import { describe, expect, it } from 'vitest';

import {
  decryptEmailVerificationPayload,
  encryptEmailVerificationPayload,
} from './outbox-payload.js';

const payload = {
  recipientEmail: 'author@example.com',
  verificationToken: 'secret-verification-token',
};

describe('outbox payload protection', () => {
  it('encrypts and decrypts an email-verification payload', () => {
    const encrypted = encryptEmailVerificationPayload(payload);

    expect(encrypted).not.toContain(payload.recipientEmail);
    expect(encrypted).not.toContain(payload.verificationToken);

    expect(decryptEmailVerificationPayload(encrypted)).toEqual(payload);
  });

  it('uses a different random IV for each encryption', () => {
    const first = encryptEmailVerificationPayload(payload);
    const second = encryptEmailVerificationPayload(payload);

    expect(first).not.toBe(second);
    expect(decryptEmailVerificationPayload(first)).toEqual(payload);
    expect(decryptEmailVerificationPayload(second)).toEqual(payload);
  });

  it('rejects a modified encrypted payload', () => {
    const encrypted = encryptEmailVerificationPayload(payload);

    const envelope = JSON.parse(encrypted) as {
      ciphertext: string;
    };

    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;

    expect(() => decryptEmailVerificationPayload(JSON.stringify(envelope))).toThrow();
  });
});
