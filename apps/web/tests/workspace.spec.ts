import { test, expect } from '@playwright/test';

test('revision, immutable history, reviewer decision and feedback resolution', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'A little progress, every day.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/trace-desktop.png', fullPage: true });
  await page.goto('/projects/calmer-campus/milestones/research');
  await page
    .getByLabel('Reflection & explanation')
    .fill('The synthesis map connects interview themes to three design opportunities.');
  await page.getByRole('button', { name: 'Save revised draft' }).click();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByLabel('Reflection & explanation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Version history' }).click();
  await expect(page.getByRole('heading', { name: 'Version 1', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Demo perspective').selectOption('reviewer');
  await page.getByRole('button', { name: 'Approve milestone' }).click();
  await expect(page.getByText('This version has been approved.')).toBeVisible();
  await page.goto('/projects/calmer-campus?tab=feedback');
  await page.getByLabel('Demo perspective').selectOption('author');
  await page.getByLabel('Your response').fill('Added the synthesis map in version 2.');
  await page.getByRole('button', { name: 'Mark addressed' }).click();
  await expect(page.getByText('Addressed by Author', { exact: true })).toBeVisible();
  await page.getByLabel('Demo perspective').selectOption('reviewer');
  await page.getByRole('button', { name: 'Resolve feedback' }).click();
  await expect(page.getByText('Resolved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Resolved', { exact: true })).toBeVisible();
  await page.goto('/projects/calmer-campus/portfolio');
  await expect(
    page.getByRole('heading', { name: 'Designing a calmer campus', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('The synthesis map connects interview themes to three design opportunities.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('create and activate an in-platform proposal', async ({ page }) => {
  await page.goto('/projects/new');
  await page.getByRole('button', { name: 'Continue with this template' }).click();
  await page.getByLabel('Project title').fill('A more welcoming library');
  await page
    .getByLabel('A little about your project')
    .fill('Explore quiet spaces and accessible wayfinding.');
  await page.getByRole('button', { name: 'Create demo project' }).click();
  await page.getByRole('button', { name: 'View team' }).click();
  await page.getByRole('button', { name: 'Simulate invitation acceptance' }).click();
  await page.getByRole('button', { name: 'Submit proposal', exact: true }).click();
  await page.getByLabel('Demo perspective').selectOption('reviewer');
  await page.getByRole('button', { name: 'Approve proposal' }).click();
  await expect(page.getByText('In progress', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByLabel('Demo perspective').selectOption('author');
  await expect(page.getByRole('button', { name: 'Request final approval' })).toBeDisabled();
});

test('mobile navigation, search, and responsive detail pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/overview');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/trace-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'My projects', exact: true }).click();
  await page.getByLabel('Search project titles').fill('Urban');
  await expect(page.getByRole('heading', { name: 'Urban green spaces & wellbeing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Designing a calmer campus' })).toHaveCount(0);
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Urban green spaces & wellbeing', exact: true })
    .click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
  await expect(page.getByRole('link', { name: /Literature review/ })).toBeVisible();
});

test('landing page explains the product and opens the workspace on desktop and mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Good work has/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/trace-landing-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Step inside Trace' }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: 'A little progress, every day.' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/trace-landing-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await page.getByRole('link', { name: 'Explore a sample portfolio' }).click();
  await expect(
    page.getByRole('heading', { name: 'Designing a calmer campus', exact: true }),
  ).toBeVisible();
});
