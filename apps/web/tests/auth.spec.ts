import { test, expect } from '@playwright/test';
const token = 'a'.repeat(43);
const session = {
  user: { id: 'test-user', email: 'author@example.com' },
  sessionId: 'current',
  csrfToken: 'csrf-test-value',
};
const record = {
  created_at: '2026-10-21T10:00:00Z',
  last_used_at: '2026-10-21T10:01:00Z',
  idle_expires_at: '2026-10-21T10:31:00Z',
  absolute_expires_at: '2026-10-28T10:00:00Z',
};

test('sign in restores account, sends CSRF on revocation, and handles expiry', async ({ page }) => {
  let authenticated = false;
  let revoked = false;
  await page.route('**/api/v1/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/login')) {
      expect(route.request().postDataJSON()).toEqual({
        email: 'author@example.com',
        password: 'CorrectPassword123!',
      });
      authenticated = true;
      return route.fulfill({ json: session });
    }
    if (path.endsWith('/session'))
      return route.fulfill(
        authenticated
          ? { json: session }
          : { status: 401, json: { error: { code: 'UNAUTHENTICATED' } } },
      );
    if (path.endsWith('/sessions/other')) {
      expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken);
      expect(route.request().method()).toBe('DELETE');
      revoked = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/sessions'))
      return route.fulfill(
        authenticated
          ? {
              json: {
                sessions: [
                  { ...record, id: 'current', current: true },
                  ...(revoked ? [] : [{ ...record, id: 'other', current: false }]),
                ],
              },
            }
          : { status: 401, json: {} },
      );
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill('author@example.com');
  await page.getByLabel('Password', { exact: true }).fill('CorrectPassword123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.reload();
  await expect(page.getByText('author@example.com', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out session 2', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm sign out' }).click();
  await expect(page.getByText('That session has been signed out.')).toBeVisible();
  expect(revoked).toBe(true);
  authenticated = false;
  await page.getByRole('button', { name: 'Refresh sessions' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('verification token is removed from URL and consumed only after confirmation', async ({
  page,
}) => {
  let posts = 0;
  await page.route('**/api/v1/auth/**', async (route) => {
    if (route.request().url().endsWith('/verify-email')) {
      posts++;
      expect(route.request().postDataJSON()).toEqual({ token });
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 401, json: {} });
  });
  await page.goto(`/verify-email#token=${token}`);
  await expect(page).toHaveURL(/\/verify-email$/);
  expect(posts).toBe(0);
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByRole('heading', { name: 'Your email is verified.' })).toBeVisible();
  expect(posts).toBe(1);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(token);
});

test('password reset validates confirmation and handles expired tokens and rate limits', async ({
  page,
}) => {
  let posts = 0;
  await page.route('**/api/v1/auth/**', async (route) => {
    if (route.request().url().endsWith('/password-reset/confirm')) {
      posts++;
      return route.fulfill({ status: 400, json: { error: { code: 'TOKEN_INVALID' } } });
    }
    if (route.request().url().endsWith('/password-reset/request'))
      return route.fulfill({ status: 429, headers: { 'Retry-After': '900' }, json: {} });
    return route.fulfill({ status: 401, json: {} });
  });
  await page.goto(`/reset-password#token=${token}`);
  await page.getByLabel('New password', { exact: true }).fill('NewPassword123!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Different123!');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('don’t match');
  expect(posts).toBe(0);
  await page.getByLabel('Confirm new password', { exact: true }).fill('NewPassword123!');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or has expired');
  await page.getByRole('link', { name: 'Request a new link' }).click();
  await page.getByLabel('Email address').fill('author@example.com');
  await page.getByRole('button', { name: 'Send email' }).click();
  await expect(page.getByRole('alert')).toContainText('15 minutes');
});

test('registration is generic and auth forms fit mobile', async ({ page }) => {
  await page.route('**/api/v1/auth/**', (route) =>
    route.fulfill(
      route.request().url().endsWith('/register')
        ? { status: 202, json: { message: 'Check email' } }
        : { status: 401, json: {} },
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.getByLabel('Email address').fill('author@example.com');
  await page.getByLabel('Password', { exact: true }).fill('CorrectPassword123!');
  await page.screenshot({ path: '/tmp/trace-auth-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await expect(page.getByText(/If registration can be completed/)).toBeVisible();
});
