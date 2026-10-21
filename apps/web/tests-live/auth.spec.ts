import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { createDecipheriv, randomUUID } from 'node:crypto';

// Use the API's PostgreSQL dependency. No browser-accessible token endpoint exists.
const { Pool } = createRequire(new URL('../../api/package.json', import.meta.url))('pg');
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test'))
  throw new Error('Test database required.');
const pool = new Pool({ connectionString: database });
const email = `web-auth-${randomUUID()}@example.com`;
const password = 'CorrectHorseBattery1!';
const updatedPassword = 'ChangedPassword123!';
async function emailToken(purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
  const result = await pool.query(
    `SELECT j.encrypted_payload, j.job_type FROM outbox_jobs j
    JOIN auth_action_tokens t ON j.idempotency_key LIKE '%:' || t.id::text
    JOIN users u ON u.id = t.user_id WHERE u.email = $1 AND t.purpose = $2
    AND t.invalidated_at IS NULL AND t.consumed_at IS NULL ORDER BY t.created_at DESC LIMIT 1`,
    [email, purpose],
  );
  const { encrypted_payload, job_type } = result.rows[0];
  const envelope = JSON.parse(encrypted_payload);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.OUTBOX_ENCRYPTION_KEY!, 'base64'),
    Buffer.from(envelope.initializationVector, 'base64'),
  );
  decipher.setAAD(Buffer.from(`trace:outbox:${job_type}:v1`));
  decipher.setAuthTag(Buffer.from(envelope.authenticationTag, 'base64'));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8'),
  ).verificationToken as string;
}
test.afterAll(async () => {
  await pool.query(
    `DELETE FROM outbox_jobs j USING auth_action_tokens t, users u WHERE j.idempotency_key LIKE '%:' || t.id::text AND t.user_id = u.id AND u.email = $1`,
    [email],
  );
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
  await pool.end();
});
test('real API: register, verify, sign in, revoke another session, reset password, sign out everywhere', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await page.goto(`/verify-email#token=${await emailToken('EMAIL_VERIFICATION')}`);
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === 'trace-session')?.httpOnly).toBe(true);
  await page.screenshot({ path: '/tmp/trace-auth-account.png', fullPage: true });
  const second = await browser.newContext({ baseURL });
  try {
    const other = await second.newPage();
    await other.goto('/login');
    await other.getByLabel('Email address').fill(email);
    await other.getByLabel('Password', { exact: true }).fill(password);
    await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(other).toHaveURL(/\/account$/);
    await page.getByRole('button', { name: 'Refresh sessions' }).click();
    await page.getByRole('button', { name: /Sign out session/ }).click();
    await page.getByRole('button', { name: 'Confirm sign out' }).click();
    await expect(page.getByText('That session has been signed out.')).toBeVisible();
    await other.reload();
    await expect(other).toHaveURL(/\/login$/);
  } finally {
    await second.close();
  }
  await page.getByRole('link', { name: 'Reset password' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send email' }).click();
  await expect(page.getByRole('status')).toContainText('If the account is eligible');
  await page.goto(`/reset-password#token=${await emailToken('PASSWORD_RESET')}`);
  await page.getByLabel('New password', { exact: true }).fill(updatedPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(updatedPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Your password is updated.' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('couldn’t sign you in');
  await page.getByLabel('Password', { exact: true }).fill(updatedPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: 'Sign out all sessions' }).click();
  await page.getByRole('button', { name: 'Confirm sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const result = await pool.query(
    `SELECT count(*)::int AS active FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1 AND s.revoked_at IS NULL`,
    [email],
  );
  expect(result.rows[0].active).toBe(0);
});
