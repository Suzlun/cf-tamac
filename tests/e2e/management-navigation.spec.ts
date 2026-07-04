import { expect, test } from '@playwright/test';

import { createE2eAgentId, registerManagedAgentThroughUi } from './managed-agent-fixture';

test('[MANAGEMENT-CLIENT-SHELL-S007] Management navigation excludes demo routes', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await registerManagedAgentThroughUi(page, agentId);
  await page.goto(`/agents/${agentId}`);

  const sectionNavigation = page.getByRole('navigation', {
    name: `Selected-Agent navigation for ${agentId}`,
  });

  await expect(sectionNavigation.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Threads' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Events' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Runs' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Schedules' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Integrations' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Settings' })).toBeVisible();
  await page.goto('/agents');

  const globalNavigation = page.getByRole('navigation', { name: 'Global navigation' });
  await expect(globalNavigation.getByRole('link', { name: 'Agents', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New Agent', exact: true })).toBeVisible();
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);
});
