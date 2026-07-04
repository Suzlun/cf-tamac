import { expect, test } from '@playwright/test';

test('[MANAGEMENT-CLIENT-SHELL-S002] Browser bundle excludes Agent RPC credentials', async ({
  page,
}) => {
  await page.goto('/agents');

  await expect(page.locator('body')).not.toContainText('x-client-credential-ref');
  await expect(page.locator('body')).not.toContainText('x-client-key-id');
  await expect(page.locator('body')).not.toContainText('createServerAgentRpcClients');
});

test('[AGENT-MANAGEMENT-UI-S011] Browser never receives signing material from signing key UI', async ({
  page,
}) => {
  await page.goto('/global-settings/signing-keys');

  await expect(page.getByRole('heading', { name: 'Client Service Signing Keys' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('privateJwk');
  await expect(page.locator('body')).not.toContainText('private_jwk');
  await expect(page.locator('body')).not.toContainText('encryptedPrivateJwk');
  await expect(page.locator('body')).not.toContainText('encrypted_private_jwk');
  await expect(page.locator('body')).not.toContainText('rawJwt');
  await expect(page.locator('body')).not.toContainText('raw_jwt');
  await expect(page.locator('body')).not.toContainText('createCompactJwt');
});
