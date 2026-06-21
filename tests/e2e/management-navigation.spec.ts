import { expect, test } from '@playwright/test';

test('[MANAGEMENT-CLIENT-S007] Management navigation excludes demo routes', async ({ page }) => {
  await page.goto('/agents/example-agent');

  await expect(page.getByRole('link', { name: 'Registry' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Threads' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Events' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Schedules' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tools' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Extensions' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);
});
