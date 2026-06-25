import { expect, test } from '@playwright/test';

test('[MANAGEMENT-CLIENT-SHELL-S002] Browser bundle excludes Agent RPC credentials', async ({
  page,
}) => {
  await page.goto('/agents');

  await expect(page.locator('body')).not.toContainText('x-client-credential-ref');
  await expect(page.locator('body')).not.toContainText('x-client-key-id');
  await expect(page.locator('body')).not.toContainText('createServerAgentRpcClients');
});
