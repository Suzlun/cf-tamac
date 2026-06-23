import { expect, test } from '@playwright/test';

import { createE2eAgentId, registerManagedAgentThroughUi } from './managed-agent-fixture';

test('[MANAGEMENT-CLIENT-S007] Management navigation excludes demo routes', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await registerManagedAgentThroughUi(page, agentId);
  await page.goto(`/agents/${agentId}`);

  const sectionNavigation = page.getByRole('navigation', { name: 'Agent management sections' });

  await expect(sectionNavigation.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Threads' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Events' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Runs' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Compactions' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Schedules' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Tools' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Integrations' })).toBeVisible();
  await expect(sectionNavigation.getByRole('link', { name: 'Settings' })).toBeVisible();
  await page.goto('/agents');

  const registryNavigation = page.getByRole('navigation', { name: 'Agent management sections' });
  await expect(
    registryNavigation.getByRole('link', { name: 'Registry', exact: true })
  ).toBeVisible();
  await expect(registryNavigation.getByRole('link', { name: 'New' })).toBeVisible();
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);
});
