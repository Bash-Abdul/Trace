import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const requireApi = createRequire(new URL('../../api/package.json', import.meta.url));
const { Pool } = requireApi('pg');
const argon2 = requireApi('argon2');
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test'))
  throw new Error('Isolated test database required');
const pool = new Pool({ connectionString: database });
const emails = ['author', 'reviewer', 'teammate'].map(
  (role) => `project-browser-${role}-${randomUUID()}@example.com`,
);
const password = 'BrowserProjectTest1!';
async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
}
test.beforeAll(async () => {
  const hash = await argon2.hash(password);
  for (const email of emails)
    await pool.query(
      'INSERT INTO users(email,password_hash,email_verified_at) VALUES($1,$2,now())',
      [email, hash],
    );
});
test.afterAll(async () => {
  await pool.query(
    'DELETE FROM projects WHERE created_by_user_id IN (SELECT id FROM users WHERE email=ANY($1::text[]))',
    [emails],
  );
  await pool.query('DELETE FROM users WHERE email=ANY($1::text[])', [emails]);
  await pool.end();
});
test('group creation, author and Reviewer invitations, shared draft and proposal approval', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const reviewerContext = await browser.newContext({ baseURL });
  const teammateContext = await browser.newContext({ baseURL });
  reviewerContext.setDefaultTimeout(10000);
  teammateContext.setDefaultTimeout(10000);
  try {
    const reviewer = await reviewerContext.newPage();
    const teammate = await teammateContext.newPage();
    await signIn(page, emails[0]!);
    await page.getByRole('link', { name: 'Open my projects' }).click();
    await page.getByRole('link', { name: 'New project', exact: true }).click();
    await page.getByRole('radio', { name: /Group/ }).check();
    await page.getByLabel('Project title').fill('A shared neighbourhood garden');
    await page
      .getByLabel('About your project')
      .fill('Investigate how shared green space supports community wellbeing.');
    await page
      .getByLabel('Objectives', { exact: true })
      .fill('Understand the community needs\nDevelop an accessible garden proposal');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'A shared neighbourhood garden', exact: true }),
    ).toBeVisible();
    const projectUrl = page.url();
    await expect(page.getByLabel('Invite as').getByRole('option')).toHaveCount(2);
    await page.getByLabel('Email address', { exact: true }).fill(emails[2]!);
    await page.getByLabel('Invite as').selectOption('AUTHOR');
    await page.getByRole('button', { name: 'Create invitation link' }).click();
    await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible();
    const teammateLink = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    await signIn(teammate, emails[2]!);
    await teammate.goto(teammateLink);
    await expect(teammate).toHaveURL(/\/invitations\/accept$/);
    await teammate.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(teammate).toHaveURL(projectUrl);
    await expect(teammate.getByRole('button', { name: 'Create invitation link' })).toHaveCount(0);
    await expect(teammate.getByRole('button', { name: 'Submit proposal' })).toHaveCount(0);
    await teammate.getByRole('button', { name: 'Edit brief' }).click();
    await teammate
      .getByLabel('About your project')
      .fill('A shared draft updated by the invited author.');
    await teammate.getByRole('button', { name: 'Save brief' }).click();
    await expect(teammate.getByRole('status')).toContainText('Project updated');
    await page.reload();
    await expect(
      page.getByText('A shared draft updated by the invited author.', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Email address', { exact: true }).fill(emails[1]!);
    await page.getByLabel('Invite as').selectOption('MAIN_REVIEWER');
    await page.getByRole('button', { name: 'Create invitation link' }).click();
    await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible();
    const reviewerLink = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    await signIn(reviewer, emails[1]!);
    await reviewer.goto(reviewerLink);
    await reviewer.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(reviewer).toHaveURL(projectUrl);
    await page.reload();
    await page.getByRole('button', { name: 'Submit proposal', exact: true }).click();
    await expect(page.getByText(/GROUP PROJECT · Proposal in review/)).toBeVisible();
    await reviewer.reload();
    await reviewer
      .getByRole('combobox', { name: 'Decision', exact: true })
      .selectOption('REQUEST_CHANGES');
    await reviewer
      .getByLabel('Reviewer feedback', { exact: true })
      .fill('Make the title more precise.');
    await reviewer.getByRole('button', { name: 'Save decision' }).click();
    await expect(reviewer.getByText(/GROUP PROJECT · Changes requested/)).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Edit brief' }).click();
    await page.getByLabel('Project title').fill('An accessible neighbourhood garden');
    await page.getByRole('button', { name: 'Save brief' }).click();
    await expect(page.getByRole('status')).toContainText('Project updated');
    await page.getByRole('button', { name: 'Submit proposal' }).click();
    await expect(page.getByText(/GROUP PROJECT · Proposal in review/)).toBeVisible();
    await reviewer.reload();
    await reviewer.getByRole('button', { name: 'Save decision' }).click();
    await expect(reviewer.getByText(/GROUP PROJECT · Active/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/GROUP PROJECT · Active/)).toBeVisible();
    await page.screenshot({ path: '/tmp/trace-real-project-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/trace-real-project-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('link', { name: 'Project brief & proposal', exact: true }).click();
    const milestoneUrl = page.url();
    await teammate.goto(milestoneUrl);
    await teammate.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await teammate.getByLabel('Evidence title', { exact: true }).fill('Interview notes');
    await teammate
      .getByLabel('Evidence text', { exact: true })
      .fill('Neighbours want accessible raised beds.');
    await teammate.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await teammate.getByLabel('Evidence title', { exact: true }).nth(1).fill('Reference');
    await teammate.getByLabel('Evidence type', { exact: true }).nth(1).selectOption('LINK');
    await teammate.getByLabel('Evidence URL', { exact: true }).fill('https://example.com/garden');
    await teammate.getByRole('button', { name: 'Save evidence draft' }).click();
    await expect(teammate.getByRole('status')).toContainText('Milestone updated');
    await expect(
      teammate.getByRole('button', { name: 'Submit milestone', exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Submit milestone', exact: true }).click();
    await expect(page.getByText('Version 1 · Awaiting review', { exact: true })).toBeVisible();
    await reviewer.goto(projectUrl);
    await expect(
      reviewer.getByRole('link', { name: 'milestone submitted', exact: true }),
    ).toBeVisible();
    await reviewer.goto(milestoneUrl);
    await reviewer
      .getByLabel('New feedback', { exact: true })
      .fill('Explain how the interviews were selected.');
    await reviewer.getByLabel('Blocking feedback', { exact: true }).check();
    await reviewer.getByRole('button', { name: 'Add feedback', exact: true }).click();
    await expect(
      reviewer.getByRole('heading', { name: 'Blocking feedback · Version 1', exact: true }),
    ).toBeVisible();
    await reviewer.getByLabel('Milestone decision').selectOption('REQUEST_REVISION');
    await reviewer.getByLabel('Review explanation').fill('Add the sampling rationale.');
    await reviewer.getByRole('button', { name: 'Save milestone decision' }).click();
    await expect(
      reviewer.getByText('Version 1 · Revision requested', { exact: true }),
    ).toBeVisible();
    await teammate.reload();
    await teammate
      .getByLabel('Evidence text', { exact: true })
      .fill('Revised: we interviewed neighbours across age groups.');
    await teammate.getByRole('button', { name: 'Save evidence draft' }).click();
    await expect(teammate.getByRole('status')).toContainText('Milestone updated');
    await teammate.getByLabel('Feedback action').selectOption('ADDRESS');
    await teammate
      .getByLabel('Feedback response')
      .fill('The revised draft now explains the sample.');
    await teammate.getByRole('button', { name: 'Save feedback response' }).click();
    await expect(teammate.getByText(/addressed by author/)).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Submit milestone', exact: true }).click();
    await expect(page.getByText('Version 2 · Awaiting review', { exact: true })).toBeVisible();
    await reviewer.reload();
    await reviewer.getByLabel('Feedback action').selectOption('RESOLVE');
    await reviewer.getByLabel('Feedback response').fill('The rationale is clear.');
    await reviewer.getByRole('button', { name: 'Save feedback response' }).click();
    await expect(reviewer.getByText(/resolved by reviewer/)).toBeVisible();
    await reviewer.getByRole('button', { name: 'Save milestone decision' }).click();
    await expect(reviewer.getByText('Version 2 · Approved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Version 2 · Approved', { exact: true })).toBeVisible();
    await page.getByText('Version 1 · Revision requested', { exact: true }).click();
    await expect(
      page.getByText('Neighbours want accessible raised beds.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Revised: we interviewed neighbours across age groups.', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: '/tmp/trace-milestone-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: '/tmp/trace-milestone-desktop.png', fullPage: true });
    await page.goto('/workspace/new');
    await page.getByLabel('Project title').fill('An individual project');
    await page.getByLabel('About your project').fill('An independently authored project.');
    await page.getByLabel('Objectives', { exact: true }).fill('Produce an individual outcome');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByLabel('Invite as').getByRole('option')).toHaveCount(1);
    await expect(page.getByLabel('Invite as')).toHaveValue('MAIN_REVIEWER');
  } finally {
    await Promise.all([reviewerContext.close(), teammateContext.close()]);
  }
});
