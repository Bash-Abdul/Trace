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
test.beforeEach(async () => {
  await pool.query('DELETE FROM auth_rate_limits');
});
test.afterAll(async () => {
  await pool.query(
    'DELETE FROM projects WHERE created_by_user_id IN (SELECT id FROM users WHERE email=ANY($1::text[]))',
    [emails],
  );
  await pool.query('DELETE FROM users WHERE email=ANY($1::text[])', [emails]);
  await pool.end();
});
test('connected workspace: group invitations, proposal approval and milestone revision', async ({
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
    await page.getByLabel('Project due date (optional)', { exact: true }).fill('2028-12-20');
    await page.getByLabel('Project timezone', { exact: true }).fill('Europe/London');
    await page.getByLabel('Milestone 1 due date (optional)', { exact: true }).fill('2028-11-01');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'A shared neighbourhood garden', exact: true }),
    ).toBeVisible();
    const projectUrl = page.url();
    await expect(page.locator('.project-heading-meta')).toContainText('20 Dec 2028');
    await page.getByRole('tab', { name: 'Team', exact: true }).click();
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
    const firstMilestone = teammate
      .getByRole('group', { name: 'Milestones', exact: true })
      .locator('.evidence-item')
      .first();
    await firstMilestone.getByText('Objectives and expected evidence', { exact: true }).click();
    await firstMilestone.getByLabel('Supports: Understand the community needs').check();
    await firstMilestone
      .getByRole('button', { name: 'Add expected evidence', exact: true })
      .click();
    await firstMilestone
      .getByLabel('Expected evidence 1', { exact: true })
      .fill('Community interview notes');
    await teammate.getByRole('button', { name: 'Save brief' }).click();
    await expect(teammate.getByRole('status').filter({ hasText: 'Project updated' })).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await expect(page.locator('.project-about')).toContainText(
      'A shared draft updated by the invited author.',
    );
    await page.getByRole('tab', { name: 'Team', exact: true }).click();
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
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'Submit proposal', exact: true }).click();
    await expect(
      page.locator('.project-heading-meta').getByText('Proposal in review', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.toast')).toContainText('Proposal submitted for review.');
    await reviewer.reload();
    await reviewer.getByRole('button', { name: 'Notifications (1 unread)', exact: true }).click();
    await reviewer
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('link', { name: /Proposal ready for review/ })
      .click();
    await expect(reviewer.getByRole('dialog', { name: 'Notifications' })).toHaveCount(0);
    await expect(
      reviewer.getByRole('button', { name: 'Notifications', exact: true }),
    ).toBeVisible();
    await reviewer
      .getByRole('combobox', { name: 'Decision', exact: true })
      .selectOption('REQUEST_CHANGES');
    await reviewer
      .getByLabel('Proposal feedback', { exact: true })
      .fill('Make the title more precise.');
    await reviewer.getByRole('button', { name: 'Save decision' }).click();
    await expect(
      reviewer.locator('.project-heading-meta').getByText('Changes requested', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Edit brief' }).click();
    await page.getByLabel('Project title').fill('An accessible neighbourhood garden');
    await page.getByRole('button', { name: 'Save brief' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Project updated' })).toBeVisible();
    await page.getByRole('button', { name: 'Submit proposal' }).click();
    await expect(
      page.locator('.project-heading-meta').getByText('Proposal in review', { exact: true }),
    ).toBeVisible();
    await reviewer.reload();
    await reviewer.getByRole('button', { name: 'Save decision' }).click();
    await expect(
      reviewer.locator('.project-heading-meta').getByText('In progress', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.locator('.project-heading-meta').getByText('In progress', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: '/tmp/trace-real-project-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.locator('.sidebar').evaluate((node) => node.getBoundingClientRect().right))
      .toBeLessThanOrEqual(0);
    await page.screenshot({ path: '/tmp/trace-real-project-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('link', { name: /MILESTONE 01.*Project brief & proposal/ }).click();
    const milestoneUrl = page.url();
    await teammate.goto(milestoneUrl);
    await teammate.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await teammate.getByLabel('Evidence title', { exact: true }).fill('Interview notes');
    await teammate
      .getByLabel('Evidence text', { exact: true })
      .fill('Neighbours want accessible raised beds.');
    await teammate.getByLabel('Objective: Understand the community needs').check();
    await teammate.getByLabel('Expected: Community interview notes · Required').check();
    await teammate.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await teammate.getByLabel('Evidence title', { exact: true }).nth(1).fill('Reference');
    await teammate.getByLabel('Evidence type', { exact: true }).nth(1).selectOption('LINK');
    await teammate.getByLabel('Evidence URL', { exact: true }).fill('https://example.com/garden');
    await teammate.getByRole('button', { name: 'Save evidence draft' }).click();
    await expect(
      teammate.getByRole('status').filter({ hasText: 'Milestone updated' }),
    ).toBeVisible();
    await expect(teammate.getByText('Draft', { exact: true }).first()).toBeVisible();
    await expect(
      teammate.getByRole('button', { name: 'Submit milestone', exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Submit milestone', exact: true }).click();
    await expect(page.getByText('Version 1 · Awaiting review', { exact: true })).toBeVisible();
    await reviewer.goto(projectUrl);
    await reviewer.getByRole('tab', { name: 'Activity', exact: true }).click();
    await expect(
      reviewer.getByRole('link', { name: 'milestone submitted', exact: true }),
    ).toBeVisible();
    await reviewer.goto('/reviews');
    await expect(
      reviewer.getByRole('region', { name: 'Review queue' }).getByRole('link'),
    ).toContainText('Milestone review');
    await reviewer.getByRole('region', { name: 'Review queue' }).getByRole('link').click();
    await expect(reviewer).toHaveURL(milestoneUrl);
    await expect(reviewer.getByText('1 Nov 2028', { exact: true }).first()).toBeVisible();
    await reviewer.getByText('Coverage in this submitted version', { exact: true }).click();
    await expect(
      reviewer.getByText('Community interview notes · Required · Evidence linked', { exact: true }),
    ).toBeVisible();
    await expect(
      reviewer.getByLabel('What would you like the Author to look at?', { exact: true }),
    ).toHaveCount(0);
    await reviewer
      .getByRole('button', { name: 'Start feedback thread for version 1', exact: true })
      .click();
    await reviewer
      .getByLabel('What would you like the Author to look at?', { exact: true })
      .fill('Explain how the interviews were selected.');
    await reviewer.getByLabel('Flag as an important concern (blocking)', { exact: true }).check();
    await reviewer.getByRole('button', { name: 'Post feedback', exact: true }).click();
    await expect(
      reviewer.getByRole('article', { name: 'Feedback thread about version 1' }),
    ).toBeVisible();
    await expect(
      reviewer.getByLabel('What would you like the Author to look at?', { exact: true }),
    ).toHaveCount(0);
    await reviewer
      .getByRole('combobox', { name: 'Milestone decision', exact: true })
      .selectOption('REQUEST_REVISION');
    await reviewer.getByLabel('Milestone decision explanation').fill('Add the sampling rationale.');
    await reviewer.getByRole('button', { name: 'Save milestone decision' }).click();
    await expect(
      reviewer.getByText('Version 1 · Revision requested', { exact: true }),
    ).toBeVisible();
    await teammate.reload();
    await teammate
      .getByLabel('Evidence text', { exact: true })
      .fill('Revised: we interviewed neighbours across age groups.');
    await teammate.getByRole('button', { name: 'Save evidence draft' }).click();
    await expect(
      teammate.getByRole('status').filter({ hasText: 'Milestone updated' }),
    ).toBeVisible();
    await teammate.getByRole('button', { name: 'Reply', exact: true }).click();
    await teammate.getByLabel('What would you like to do?').selectOption('ADDRESS');
    await expect(
      teammate.getByText(/save and submit your revised evidence separately/),
    ).toBeVisible();
    await teammate
      .getByLabel('What did you change?')
      .fill('The revised draft now explains the sample.');
    await teammate.getByRole('button', { name: 'Send for Reviewer check' }).click();
    await expect(teammate.getByText('Awaiting Reviewer check', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Submit milestone', exact: true }).click();
    await expect(page.getByText('Version 2 · Awaiting review', { exact: true })).toBeVisible();
    await reviewer.reload();
    await reviewer.getByRole('button', { name: 'Reply', exact: true }).click();
    await reviewer.getByLabel('What would you like to do?').selectOption('RESOLVE');
    await reviewer.getByLabel('Why is this resolved?').fill('The rationale is clear.');
    await reviewer.getByRole('button', { name: 'Resolve feedback' }).click();
    await expect(reviewer.getByText('Resolved', { exact: true })).toBeVisible();
    const feedbackThread = reviewer.getByRole('article', {
      name: 'Feedback thread about version 1',
    });
    await expect(
      feedbackThread.getByRole('list', { name: 'Thread replies' }).getByRole('listitem'),
    ).toHaveCount(2);
    await feedbackThread.getByRole('button', { name: '2 replies · Hide replies' }).click();
    await expect(feedbackThread.getByRole('list', { name: 'Thread replies' })).toBeHidden();
    await feedbackThread.getByRole('button', { name: '2 replies · Show replies' }).click();
    await expect(feedbackThread.getByRole('list', { name: 'Thread replies' })).toBeVisible();
    await feedbackThread.screenshot({ path: '/tmp/trace-feedback-thread.png' });
    await reviewer.getByRole('button', { name: 'Save milestone decision' }).click();
    await expect(reviewer.getByText('Version 2 · Approved', { exact: true })).toBeVisible();
    await reviewer.goto('/reviews');
    await expect(
      reviewer.getByRole('heading', { name: 'Nothing needs your attention right now' }),
    ).toBeVisible();
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
    // Active-plan changes use a separate draft and require the main Reviewer's approval.
    await page.goto(projectUrl);
    await page.getByRole('tab', { name: 'Changes', exact: true }).click();
    await page.getByRole('button', { name: 'Correct wording', exact: true }).click();
    await page
      .getByLabel('Reason for the change')
      .fill('Correct punctuation without changing the agreed meaning.');
    await page
      .getByLabel('About your project')
      .fill('A shared draft updated by the invited author!');
    await page.getByLabel('I confirm that meaning, scope and requirements are unchanged.').check();
    await page.getByRole('button', { name: 'Save minor edit', exact: true }).click();
    await page.getByRole('button', { name: 'Propose a project change', exact: true }).click();
    await page
      .getByLabel('Reason for the change')
      .fill('Include a final presentation of our research.');
    await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
    const milestoneTitles = page.getByLabel(/Milestone \d+ title/);
    await milestoneTitles.last().fill('Community presentation');
    await page.getByRole('button', { name: 'Save change draft', exact: true }).click();
    await page.getByRole('button', { name: 'Submit change for review', exact: true }).click();
    await expect(page.getByText('Awaiting Reviewer', { exact: true })).toBeVisible();
    await reviewer.goto(projectUrl + '?tab=changes');
    await expect(reviewer.getByText('Include a final presentation of our research.')).toBeVisible();
    await reviewer
      .getByLabel('Project change feedback')
      .fill('The added milestone fits the agreed plan.');
    await reviewer.getByRole('button', { name: 'Save change decision', exact: true }).click();
    await expect(reviewer.getByText('Approved and applied', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Approved and applied', { exact: true })).toBeVisible();
    await page.getByText('Compare before and proposed plans', { exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({
      path: '/tmp/trace-project-changes-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: '/tmp/trace-project-changes-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
    await expect(page.getByRole('link', { name: /Community presentation/ })).toBeVisible();
    // Contributors prepare final outputs; the lead submits immutable versions for the Reviewer.
    await teammate.goto(projectUrl);
    await teammate.getByRole('link', { name: 'Open deliverable', exact: true }).first().click();
    const deliverableUrl = teammate.url();
    await teammate
      .getByLabel('Deliverable text', { exact: true })
      .fill('Our final garden proposal.');
    await teammate.getByRole('button', { name: 'Save deliverable draft' }).click();
    await expect(teammate.getByText('Your lead Author submits the saved draft.')).toBeVisible();
    await expect(teammate.getByRole('button', { name: 'Submit final deliverable' })).toHaveCount(0);
    await page.goto(deliverableUrl);
    await page.getByLabel('Submission note (optional)').fill('Ready for review.');
    await expect(page.getByRole('button', { name: 'Submit final deliverable' })).toBeDisabled();
    await page.getByRole('button', { name: 'Save deliverable draft' }).click();
    await page.getByRole('button', { name: 'Submit final deliverable' }).click();
    await expect(page.getByText('Version 1 · Current submission', { exact: true })).toBeVisible();
    await reviewer.goto(deliverableUrl);
    await expect(reviewer.getByRole('heading', { name: 'Current submitted output' })).toBeVisible();
    await expect(reviewer.getByRole('button', { name: 'Start a revision' })).toHaveCount(0);
    await teammate.reload();
    await teammate.getByRole('button', { name: 'Start a revision' }).click();
    const revisionResponse = teammate.waitForResponse(
      (response) => response.url().endsWith('/revision') && response.request().method() === 'POST',
    );
    await teammate.getByRole('button', { name: 'Confirm revision' }).click();
    const revised = await revisionResponse;
    expect(revised.status(), await revised.text()).toBe(200);
    expect((await revised.json()).state).toBe('DRAFT');
    await expect(
      teammate.getByRole('heading', { name: 'Deliverable draft' }),
      await teammate.locator('main').innerText(),
    ).toBeVisible();
    await teammate
      .getByLabel('Deliverable text', { exact: true })
      .fill('Our revised garden proposal.');
    await teammate.getByRole('button', { name: 'Save deliverable draft' }).click();
    await expect(
      teammate.getByRole('status').filter({ hasText: 'Deliverable updated.' }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Submit final deliverable' }).click();
    await expect(page.getByText('Version 2 · Current submission', { exact: true })).toBeVisible();
    await page.getByText('Version 1 · Previous submission', { exact: true }).click();
    await expect(page.getByText('Our final garden proposal.', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '/tmp/trace-deliverable-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // A lead can remove a contributor without deleting their work, then re-invite and transfer leadership.
    await page.goto(projectUrl + '?tab=team');
    const contributorRow = page.locator('.team-row').filter({ hasText: emails[2]! });
    await contributorRow.getByRole('button', { name: 'Remove Author', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Reason for this team change')
      .fill('The contributor is taking a break.');
    await page.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByText('Former Authors · preserved contributions', { exact: true }).click();
    await expect(page.getByText('No current access', { exact: true })).toBeVisible();
    await teammate.goto(projectUrl);
    await expect(teammate.getByRole('alert')).toContainText('Project not found');
    await page.screenshot({
      path: '/tmp/trace-group-team-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: '/tmp/trace-group-team-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('Email address', { exact: true }).fill(emails[2]!);
    await page.getByLabel('Invite as').selectOption('AUTHOR');
    await page.getByRole('button', { name: 'Create invitation link' }).click();
    await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible();
    await teammate.goto(await page.getByLabel('Invitation link', { exact: true }).inputValue());
    await teammate.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(teammate).toHaveURL(projectUrl);
    await page.reload();
    await page
      .locator('.team-row')
      .filter({ hasText: emails[2]! })
      .getByRole('button', { name: 'Make lead Author', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByLabel('Reason for this team change')
      .fill('The contributor will lead the remaining work.');
    await page.getByRole('button', { name: 'Confirm lead transfer', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create invitation link' })).toHaveCount(0);
    await teammate.goto(projectUrl + '?tab=team');
    await expect(teammate.getByRole('button', { name: 'Create invitation link' })).toBeVisible();
    await expect(
      teammate
        .locator('.team-row')
        .filter({ hasText: emails[0]! })
        .getByRole('button', { name: 'Remove Author', exact: true }),
    ).toBeVisible();
    await page.goto('/workspace/new');
    await page.getByLabel('Starting template').selectOption('custom');
    await page.getByLabel('Milestone 1 title', { exact: true }).fill('Research');
    await page.getByRole('button', { name: 'Add milestone', exact: true }).click();
    await page.getByLabel('Milestone 2 title', { exact: true }).fill('Optional pilot');
    await page.getByLabel('Milestone 2 required', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Move milestone 2 up' }).click();
    await page.getByLabel('Deliverable 1 title', { exact: true }).fill('Project report');
    await page.getByLabel('Project title').fill('An individual project');
    await page.getByLabel('About your project').fill('An independently authored project.');
    await page.getByLabel('Objectives', { exact: true }).fill('Produce an individual outcome');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(
      page.getByRole('link', { name: /MILESTONE 01 · OPTIONAL.*Optional pilot/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit brief', exact: true }).click();
    await expect(page.getByLabel('Milestone 1 title', { exact: true })).toHaveValue(
      'Optional pilot',
    );
    await expect(page.getByLabel('Milestone 1 required', { exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('tab', { name: 'Team', exact: true }).click();
    await expect(page.getByLabel('Invite as').getByRole('option')).toHaveCount(1);
    await expect(page.getByLabel('Invite as')).toHaveValue('MAIN_REVIEWER');
  } finally {
    await Promise.all([reviewerContext.close(), teammateContext.close()]);
  }
});

test('final approval: readiness, invalidation, revision and completion preserve the project record', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ baseURL });
  try {
    const reviewer = await context.newPage();
    await signIn(page, emails[0]!);
    await page.goto('/projects/new');
    await page.getByLabel('Starting template').selectOption('custom');
    await page.getByLabel('Project title').fill('Final approval browser project');
    await page.getByLabel('About your project').fill('A complete project for final review.');
    await page.getByLabel('Objectives', { exact: true }).fill('Deliver the research');
    await page.getByLabel('Approval route').selectOption('EXTERNALLY_APPROVED');
    await page.getByLabel('Milestone 1 title', { exact: true }).fill('Research');
    await page.getByLabel('Deliverable 1 title', { exact: true }).fill('Research report');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Final approval browser project', exact: true }),
    ).toBeVisible();
    const projectUrl = page.url();
    await page.getByRole('tab', { name: 'Team', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill(emails[1]!);
    await page.getByRole('button', { name: 'Create invitation link' }).click();
    const link = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    await signIn(reviewer, emails[1]!);
    await reviewer.goto(link);
    await reviewer.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(reviewer).toHaveURL(projectUrl);
    await page.goto(projectUrl);
    await expect(
      page.getByRole('button', { name: 'Request final approval', exact: true }),
    ).toBeDisabled();
    await page.getByRole('link', { name: /MILESTONE 01.*Research/ }).click();
    const milestoneUrl = page.url();
    await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await page.getByLabel('Evidence title', { exact: true }).fill('Findings');
    await page.getByLabel('Evidence text', { exact: true }).fill('We completed the research.');
    await page.getByRole('button', { name: 'Save evidence draft' }).click();
    await page.getByRole('button', { name: 'Submit milestone', exact: true }).click();
    await expect(page.getByText('Version 1 · Awaiting review', { exact: true })).toBeVisible();
    await reviewer.goto(milestoneUrl);
    await reviewer.getByRole('button', { name: 'Save milestone decision' }).click();
    await expect(reviewer.getByText('Version 1 · Approved', { exact: true })).toBeVisible();
    await page.goto(projectUrl);
    await page.getByRole('link', { name: 'Open deliverable', exact: true }).click();
    const outputUrl = page.url();
    await page.getByLabel('Deliverable text', { exact: true }).fill('Our research report.');
    await page.getByRole('button', { name: 'Save deliverable draft' }).click();
    await page.getByRole('button', { name: 'Submit final deliverable' }).click();
    await expect(page.getByText('Version 1 · Current submission', { exact: true })).toBeVisible();
    await page.goto(projectUrl);
    await page.getByRole('link', { name: 'Process portfolio', exact: true }).click();
    await expect(page.getByText('Live preview · work in progress', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to project' }).click();
    await page.getByRole('button', { name: 'Request final approval', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Withdraw final request' })).toBeVisible();
    await page.goto(outputUrl);
    await page.getByRole('button', { name: 'Start a revision' }).click();
    await page.getByRole('button', { name: 'Confirm revision' }).click();
    await expect(page.getByRole('button', { name: 'Submit final deliverable' })).toBeVisible();
    await reviewer.goto(projectUrl);
    await reviewer.getByText('Final approval history', { exact: true }).click();
    await expect(
      reviewer.getByText('Request 1 · Invalidated by project changes', { exact: true }),
    ).toBeVisible();
    await expect(reviewer.getByRole('button', { name: 'Save final decision' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Submit final deliverable' }).click();
    await expect(page.getByText('Version 2 · Current submission', { exact: true })).toBeVisible();
    await page.goto(projectUrl);
    await page.getByRole('button', { name: 'Request final approval', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Withdraw final request' })).toBeVisible();
    await reviewer.goto('/reviews');
    await reviewer
      .getByRole('region', { name: 'Review queue' })
      .getByRole('link')
      .filter({ hasText: 'Final approval browser project' })
      .click();
    await reviewer.getByLabel('Final project decision').selectOption('REQUEST_REVISION');
    await reviewer
      .getByLabel('Final approval feedback')
      .fill('Please confirm the report is final.');
    await reviewer.getByRole('button', { name: 'Save final decision' }).click();
    await expect(reviewer.getByRole('button', { name: 'Save final decision' })).toHaveCount(0);
    await page.reload();
    await page.getByText('Final approval history', { exact: true }).click();
    await expect(
      page.getByText('Please confirm the report is final.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Request final approval', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Withdraw final request' })).toBeVisible();
    await reviewer.goto(projectUrl);
    await reviewer.getByLabel('Final approval feedback').fill('Confirmed. Well done.');
    await reviewer.getByRole('button', { name: 'Save final decision' }).click();
    await expect(
      reviewer.getByRole('heading', { name: 'Project completed', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Project completed', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Request final approval', exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: '/tmp/trace-final-approval-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('link', { name: 'Process portfolio', exact: true }).click();
    await expect(page.getByText('Completed project · final record', { exact: true })).toBeVisible();
    await expect(page.locator('.portfolio-document details[open]')).toHaveCount(0);
    await expect(page.getByText('Our research report.', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Our research report.', { exact: true }).first()).toBeHidden();
    await page.getByText('Deliverable versions and details', { exact: true }).click();
    await expect(page.getByText('Our research report.', { exact: true }).first()).toBeVisible();
    await page.getByText('Deliverable versions and details', { exact: true }).click();
    await expect(page.getByText('Confirmed. Well done.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: '/tmp/trace-portfolio-mobile.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.portfolio-toolbar')).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'Feedback that shaped the work' }),
    ).toBeVisible();
    await page.pdf({ path: '/tmp/trace-portfolio-print.pdf', preferCSSPageSize: true });
    await expect(page.locator('.portfolio-document details[open]')).toHaveCount(0);
    await page.emulateMedia({ media: 'screen' });
    await page.goto('/portfolio');
    await expect(
      page
        .locator('.portfolio-grid')
        .getByRole('link')
        .filter({ hasText: 'Final approval browser project' }),
    ).toContainText('Final record');
    await page.goto(outputUrl);
    await expect(page.getByRole('button', { name: 'Start a revision' })).toHaveCount(0);
    await page.goto('/projects');
    await page.getByRole('button', { name: 'Completed', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Final approval browser project', exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
