import { test, expect, type Page } from '@playwright/test';
const session = {
  user: { id: 'author', email: 'author@example.com' },
  sessionId: 'current',
  csrfToken: 'test-csrf',
};
const projects = [
  {
    id: 'garden',
    title: 'Community garden',
    description: 'A real project brief.',
    project_type: 'GROUP',
    approval_route: 'IN_PLATFORM_PROPOSAL',
    status: 'ACTIVE',
    version: 2,
    role: 'LEAD_AUTHOR',
  },
  {
    id: 'library',
    title: 'Accessible library',
    description: 'Review this project.',
    project_type: 'INDIVIDUAL',
    approval_route: 'IN_PLATFORM_PROPOSAL',
    status: 'PROPOSAL_IN_REVIEW',
    version: 1,
    role: 'MAIN_REVIEWER',
  },
];
const queueItem = {
  id: 'proposal-1',
  kind: 'PROPOSAL',
  project_id: 'library',
  project_title: 'Accessible library',
  role: 'MAIN_REVIEWER',
  milestone_id: null,
  milestone_title: null,
  number: 1,
  state: 'PROPOSAL_IN_REVIEW',
  body: null,
  blocking: false,
  updated_at: '2026-10-23T12:00:00Z',
  perspective: 'reviewer',
  needs_attention: true,
  action: 'Review submission',
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/projects/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread_count: 0, next_cursor: null } }),
  );
  await page.route('**/api/v1/projects/reviews', (route) =>
    route.fulfill({ json: { items: [queueItem], truncated: false } }),
  );
});
async function authenticate(page: Page) {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ json: session }));
}
test('overview and project search use API records, not saved demo data', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: { projects } }));
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'A little progress, every day.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Community garden' })).toBeVisible();
  await expect(page.getByLabel('Demo perspective')).toHaveCount(0);
  await expect(page.getByText('Live milestone threads')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Process portfolios', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/trace-connected-desktop.png', fullPage: true });
  await page.getByRole('navigation').getByRole('link', { name: 'My projects' }).click();
  await page.getByLabel('Search project titles').fill('garden');
  await expect(page.getByRole('heading', { name: 'Community garden' })).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /Review & feedback/ })
    .click();
  await expect(page.getByRole('region', { name: 'Review queue' }).getByRole('link')).toContainText(
    'Accessible library',
  );
  await expect(
    page.getByRole('region', { name: 'Review queue' }).getByRole('link'),
  ).toHaveAttribute('href', '/projects/library?tab=overview');
});
test('failed loads can retry and empty accounts never display sample projects', async ({
  page,
}) => {
  await authenticate(page);
  let failed = true;
  await page.route('**/api/v1/projects', (route) =>
    failed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { projects: [] } }),
  );
  await page.goto('/projects');
  await expect(page.getByRole('alert')).toContainText('Please try again');
  failed = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A little room for something new' }),
  ).toBeVisible();
  await expect(page.locator('.project-card')).toHaveCount(0);
});
test('mobile navigation and legacy URLs lead to the connected workspace', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: { projects } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Community garden' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little progress, every day.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect
    .poll(() => page.locator('.sidebar').evaluate((node) => node.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  await page.screenshot({ path: '/tmp/trace-connected-mobile.png', fullPage: true });
  await page.goto('/workspace/projects/missing?tab=team');
  await expect(page).toHaveURL(/\/projects\/missing\?tab=team$/);
});
test('protected workspace redirects on missing or expired sessions', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({ status: 401, json: { error: { message: 'Sign in' } } }),
  );
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/login$/);
  await authenticate(page);
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ status: 401, json: { error: { message: 'Session expired' } } }),
  );
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
});
test('landing page opens sign-in instead of a fictional workspace', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/');
  await page.getByRole('link', { name: 'Step inside Trace' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('Reviewer accounts open a distinct review desk and retain demo previews', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { projects: [projects[1]] } }),
  );
  await page.goto('/overview');
  await expect(page.getByText('YOUR REVIEW DESK', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'A fresh perspective makes a difference.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Workspace perspective')).toHaveText('Reviewer view');
  await expect(page.getByRole('combobox', { name: 'Workspace perspective' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open review queue', exact: true })).toBeVisible();
  await expect(page.getByText('Let’s keep your projects moving.', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/trace-reviewer-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Process portfolios', exact: true }).click();
  await expect(page.getByText('Demo preview', { exact: true }).last()).toBeVisible();
  await page.getByRole('link', { name: /Designing a calmer campus/ }).click();
  await expect(page).toHaveURL(/\/demo\/projects\/calmer-campus\/portfolio$/);
  await expect(
    page.getByRole('heading', { name: 'Designing a calmer campus', exact: true }),
  ).toBeVisible();
});

test('review queue filters waiting work and refreshes after a decision', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: { projects } }));
  let items = [
    queueItem,
    {
      ...queueItem,
      id: 'thread-1',
      kind: 'MILESTONE_FEEDBACK',
      milestone_id: 'research',
      milestone_title: 'Research',
      needs_attention: false,
      state: 'OPEN',
      action: 'Awaiting author response',
      body: 'Explain the sample',
    },
  ];
  await page.route('**/api/v1/projects/reviews', (route) =>
    route.fulfill({ json: { items, truncated: false } }),
  );
  await page.goto('/reviews');
  const links = page.getByRole('region', { name: 'Review queue' }).getByRole('link');
  await expect(links).toHaveCount(1);
  await page.getByRole('button', { name: 'All ongoing work', exact: true }).click();
  await expect(links).toHaveCount(2);
  await page.screenshot({ path: '/tmp/trace-review-queue-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/trace-review-queue-mobile.png', fullPage: true });
  await page.getByLabel('Review type').selectOption('MILESTONE_FEEDBACK');
  await expect(links).toHaveCount(1);
  await expect(links).toContainText('Explain the sample');
  items = [];
  await page.getByRole('button', { name: 'Refresh reviews' }).click();
  await expect(page.getByRole('heading', { name: 'No ongoing work in this view' })).toBeVisible();
});

test('live projects preserve the original card and overview layout with real progress', async ({
  page,
}) => {
  await authenticate(page);
  const progress = {
    milestones: [
      { id: 'research', required: true, state: 'APPROVED', evidence_count: 2 },
      { id: 'prototype', required: true, state: 'REVISION_REQUESTED', evidence_count: 1 },
    ],
    unresolved_feedback: 1,
    blocking_feedback: 1,
    members: [
      { user_id: 'author', email: 'author@example.com' },
      { user_id: 'reviewer', email: 'reviewer@example.com' },
    ],
  };
  const project = { ...projects[0], template_key: 'design', progress };
  await page.route('**/api/v1/projects', (route) =>
    route.fulfill({ json: { projects: [project] } }),
  );
  await page.route('**/api/v1/projects/garden', (route) =>
    route.fulfill({
      json: {
        ...project,
        objectives: [
          'Understand how neighbours use shared spaces.',
          'Evaluate an accessible garden prototype.',
        ],
        milestones: [
          { id: 'research', title: 'Research & insights', required: true },
          { id: 'prototype', title: 'Prototype & evaluation', required: true },
        ],
        deliverables: [{ id: 'report', title: 'Final project report', required: true }],
        members: [{ user_id: 'author', email: 'author@example.com', role: 'LEAD_AUTHOR' }],
        proposals: [],
        invitations: [],
        events: [],
      },
    }),
  );
  await page.goto('/projects');
  await expect(page.locator('.project-icon.sage')).toBeVisible();
  await expect(page.getByLabel('1 of 2 milestones approved')).toBeVisible();
  await expect(page.locator('.people-stack .avatar')).toHaveCount(2);
  await expect(page.locator('.card-feedback')).toContainText(
    '1 unresolved milestone feedback thread',
  );
  await page.screenshot({ path: '/tmp/trace-restored-project-cards.png', fullPage: true });
  await page.getByRole('heading', { name: 'Community garden' }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'A question worth exploring.' })).toBeVisible();
  await expect(page.locator('.objective')).toHaveCount(2);
  const help = page.getByRole('button', { name: 'Help: The path ahead', exact: true });
  await help.focus();
  await expect(page.getByRole('tooltip')).toContainText('milestones in your project plan');
  await help.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await help.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.getByRole('heading', { name: 'A question worth exploring.' }).hover();
  await expect(page.getByRole('heading', { name: 'At a glance' })).toBeVisible();
  await expect(page.locator('.project-summary')).toContainText('3 items');
  await expect(page.locator('.milestone-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Request final approval' })).toBeDisabled();
  await page.screenshot({ path: '/tmp/trace-restored-project-overview.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((node) => node.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/trace-restored-project-mobile.png', fullPage: true });
});

test('notification bell supports read state, failures and navigation on mobile', async ({
  page,
}) => {
  await authenticate(page);
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: { projects } }));
  let read = false;
  let fail = false;
  const item = {
    id: 'notification-1',
    project_id: 'library',
    project_title: 'Accessible library',
    milestone_id: null,
    milestone_title: null,
    action: 'PROPOSAL_DECIDED',
    details: { decision: 'APPROVE' },
    created_at: '2026-10-24T12:00:00Z',
  };
  await page.route('**/api/v1/projects/notifications**', (route) => {
    if (route.request().method() !== 'GET') {
      expect(route.request().headers()['x-csrf-token']).toBe('test-csrf');
      if (fail) return route.fulfill({ status: 500, json: {} });
      read = route.request().url().endsWith('/read-all')
        ? true
        : route.request().postDataJSON().read;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: {
        items: [{ ...item, read_at: read ? '2026-10-24T13:00:00Z' : null }],
        unread_count: read ? 0 : 1,
        next_cursor: null,
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Notifications (1 unread)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog.getByRole('link', { name: /Proposal approved/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Mark unread', exact: true })).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Notification marked read.');
  await dialog.getByRole('button', { name: 'Mark unread', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Mark read', exact: true })).toBeVisible();
  fail = true;
  await dialog.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not complete');
  await expect(dialog.getByRole('button', { name: 'Mark read', exact: true })).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(dialog.getByText('0 unread', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/trace-notifications-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '/tmp/trace-notifications-desktop.png', fullPage: true });
  await dialog.getByRole('link', { name: /Proposal approved/ }).click();
  await expect(page).toHaveURL(/\/projects\/library\?tab=overview$/);
  await expect(dialog).toHaveCount(0);
});
