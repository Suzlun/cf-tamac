import { expect, test } from '@playwright/test';

import { createE2eAgentId, registerManagedAgentThroughUi } from './managed-agent-fixture';

test('[MANAGEMENT-CLIENT-S001] Agent registry shell renders without demo content', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await registerManagedAgentThroughUi(page, agentId);
  await page.goto('/agents');

  await expect(page.getByText('Agent registry').first()).toBeVisible();
  const displayNameButton = page.getByRole('button', { name: `E2E ${agentId}`, exact: true });
  const registeredAgentRow = page
    .getByRole('table', { name: 'Managed Agents' })
    .getByRole('row')
    .filter({ has: displayNameButton });
  await expect(registeredAgentRow).toBeVisible();
  await expect(registeredAgentRow).toContainText(agentId);
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);

  await displayNameButton.click();
  await expect(page.getByText(`agent_id: ${agentId}`)).toBeVisible();
});

test('[MANAGEMENT-CLIENT-S001] Registry shell keeps registration calls to action', async ({
  page,
}) => {
  await page.goto('/agents');

  await expect(page.getByText('Agent registry').first()).toBeVisible();
  await expect(
    page.locator('.action-row').first().getByRole('link', { name: 'New Agent record' })
  ).toBeVisible();
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);
});
