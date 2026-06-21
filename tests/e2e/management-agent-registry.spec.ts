import { expect, test } from '@playwright/test';

test('[MANAGEMENT-CLIENT-S001] Agent registry shell renders without demo content', async ({
  page,
}) => {
  await page.goto('/agents');

  await expect(page.getByText('Agent registry').first()).toBeVisible();
  await expect(page.getByText('Register the first managed Agent.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'New Agent record' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Preview detail shell' })).toBeVisible();
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);

  await page.getByRole('link', { name: 'Preview detail shell' }).click();
  await expect(page.getByText('agent_id: example-agent')).toBeVisible();
});
