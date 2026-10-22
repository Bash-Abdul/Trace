import { describe, expect, it } from 'vitest';
import { rateLimitBodySchema } from './auth.schema.js';

describe('rate-limit email extraction', () => {
  it('uses the same key for casing and whitespace variants despite invalid route fields', () => {
    const result = rateLimitBodySchema.parse({ email: '  Author@Example.com  ', password: 42 });
    expect(result.email).toBe('author@example.com');
  });

  it('still extracts invalid email strings and caps the bucket key length', () => {
    expect(rateLimitBodySchema.parse({ email: 'NOT-AN-EMAIL' }).email).toBe('not-an-email');
    expect(rateLimitBodySchema.parse({ email: 'A'.repeat(400) }).email).toBe('a'.repeat(320));
  });

  it.each([undefined, null, [], {}, { email: null }, { email: 42 }])(
    'leaves bodies without a string email to the network limiter: %j',
    (body) => {
      expect(rateLimitBodySchema.safeParse(body).success).toBe(false);
    },
  );
});
