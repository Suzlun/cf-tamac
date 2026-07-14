import { expect, test } from '@playwright/test';

import {
  createE2eAgentId,
  E2E_APPROVED_AGENT_RPC_ORIGIN,
  ensureDefaultSigningKeyThroughUi,
  fillManagedAgentRegistrationForm,
  registerManagedAgentThroughUi,
  submitManagedAgentRegistration,
} from './managed-agent-fixture';

const FORBIDDEN_BROWSER_SECRET_PATTERNS = [
  /privatejwk/i,
  /private_jwk/i,
  /encryptedprivatejwk/i,
  /encrypted_private_jwk/i,
  /rawjwt/i,
  /raw_jwt/i,
] as const;

test('[MANAGEMENT-CLIENT-SHELL-S001] Agent registry shell renders without demo content', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await registerManagedAgentThroughUi(page, agentId);
  await page.goto('/agents');

  await expect(page.getByText('Agent registry').first()).toBeVisible();
  const registeredAgentItem = page
    .getByRole('region', { name: 'Managed Agents' })
    .getByRole('listitem')
    .filter({ hasText: agentId });
  const openOverviewButton = registeredAgentItem.getByRole('button', {
    name: `Open E2E ${agentId} overview`,
  });
  await expect(registeredAgentItem).toBeVisible();
  await expect(registeredAgentItem).toContainText(agentId);
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);

  await openOverviewButton.click();
  await expect(page.getByText(`agent_id: ${agentId}`)).toBeVisible();
});

test('[MANAGEMENT-CLIENT-SHELL-S001] Registry shell keeps registration calls to action', async ({
  page,
}) => {
  await page.goto('/agents');

  await expect(page.getByText('Agent registry').first()).toBeVisible();
  await expect(
    page.locator('header').getByRole('link', { name: 'New Agent', exact: true })
  ).toBeVisible();
  await expect(page.getByText(/hello|users/i)).toHaveCount(0);
});

test('[TAMAC-SDK-S007] 許可済み HTTPS origin で managed Agent を登録する', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await ensureDefaultSigningKeyThroughUi(page);

  // desktop wireframe は登録見出し、初期 ResultRegion、44px の主要操作を同じ DOM 順で提供する。
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto('/agents/new');
  await expect(
    page.getByRole('heading', { name: 'サーバー側参照情報でAgentを登録します' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agentを登録', exact: true })).toHaveCSS(
    'min-height',
    '44px'
  );

  // mobile wireframe でも同じ field order と touch target を保ち、canonicalization 対象の Browser input を送る。
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Agent ID', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Agent RPC origin', { exact: true })).toBeVisible();
  await fillManagedAgentRegistrationForm(
    page,
    agentId,
    'https://CF-TAMAC-AGENT.EXAMPLE.WORKERS.DEV:443'
  );
  await submitManagedAgentRegistration(page, agentId);

  const successHeading = page.getByRole('heading', { name: 'Agentを登録しました' });
  const successRegion = successHeading.locator('..');
  await expect(successRegion).toHaveAttribute('role', 'status');
  await expect(successRegion).toHaveAttribute('aria-live', 'polite');
  await expect(successHeading).toBeFocused();
  await expect(successRegion).toContainText(`「E2E ${agentId}」を管理対象に追加しました。`);

  // 登録フォーム入力は canonical 値でなくてもよいが、registry metadata には server policy の canonical origin だけが残る。
  await page.getByRole('link', { name: 'Agent一覧に戻る', exact: true }).click();
  const registeredAgentItem = page
    .getByRole('region', { name: 'Managed Agents' })
    .getByRole('listitem')
    .filter({ hasText: agentId });
  await expect(registeredAgentItem).toContainText(E2E_APPROVED_AGENT_RPC_ORIGIN);
});

test('[AGENT-MANAGEMENT-UI-S010] Signing key management handles Global Settings key lifecycle', async ({
  page,
}) => {
  await ensureDefaultSigningKeyThroughUi(page);
  await page.getByRole('button', { name: 'Generate Key' }).first().click();

  await expect(page.getByRole('heading', { name: 'Client Service Signing Keys' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('cf-tamac-client');
  await expect(page.getByRole('table')).toContainText('sha256_b64u:');
  await expect(page.getByText('active', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Default', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Disable and delete require a trust config update')).toBeVisible();
});

test('[AGENT-MANAGEMENT-UI-S012] Agent settings verifies issuer kid fingerprint and health result', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await registerManagedAgentThroughUi(page, agentId);
  await page.goto(`/agents/${agentId}/settings`);

  await expect(
    page.getByRole('heading', { name: 'Signing Key Selection And Health' })
  ).toBeVisible();
  await expect(page.getByText('Selected issuer / kid / fingerprint (read-only)')).toBeVisible();
  await expect(page.getByText('Issuer', { exact: true })).toBeVisible();
  await expect(page.getByText('Key id', { exact: true })).toBeVisible();
  await expect(page.getByText('Public fingerprint', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Run Health Check' }).click();
  await expect(page.getByText('verified', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Last Verified At')).toBeVisible();
  await expect(page.getByText('Safe diagnostic codes')).toBeVisible();
});

test('[AGENT-MANAGEMENT-UI-S013] Trust config export produces public-only JSON under Global Settings', async ({
  page,
}) => {
  await ensureDefaultSigningKeyThroughUi(page);
  await page.goto('/global-settings/trust-config-export');

  await page.getByRole('button', { name: 'Generate public-only JSON' }).click();
  await expect(page.getByText('Schema validation passed')).toBeVisible({ timeout: 15_000 });

  const preview = page.getByLabel('Generated trust config JSON');
  await expect(preview).toContainText('"version": "1"');
  await expect(preview).toContainText('"kty": "OKP"');
  await expect(preview).toContainText('"crv": "Ed25519"');
  await expect(preview).toContainText('"fingerprint": "sha256_b64u:');
  await expect(preview).not.toContainText('"d"');
  await expect(preview).not.toContainText('privateJwk');
  await expect(preview).not.toContainText('encryptedPrivateJwk');
  await expect(preview).not.toContainText('rawJwt');
});

test('[AGENT-MANAGEMENT-UI-S014] Broad scope selection shows warning and schema validation together', async ({
  page,
}) => {
  await ensureDefaultSigningKeyThroughUi(page);
  await page.goto('/global-settings/trust-config-export');

  await page.getByText('agent:write', { exact: true }).click();
  await page.getByRole('button', { name: 'Generate public-only JSON' }).click();

  await expect(page.getByText('Broad permission warning')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Schema validation passed')).toBeVisible();
});

test('[AGENT-MANAGEMENT-UI-S019] Selected-Agent pages render real Agent RPC data after trust setup', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await registerManagedAgentThroughUi(page, agentId);
  await page.goto(`/agents/${agentId}/settings`);
  await page.getByRole('button', { name: 'Run Health Check' }).click();
  await expect(page.getByText('verified', { exact: true })).toBeVisible({ timeout: 15_000 });

  for (const [route, navigationLabel] of [
    ['', 'Overview'],
    ['threads', 'Threads'],
    ['events', 'Events'],
    ['runs', 'Runs'],
    ['schedules', 'Schedules'],
    ['integrations', 'Integrations'],
    ['settings', 'Settings'],
  ] as const) {
    // 実利用者と同じ selected-Agent navigation を使い、dev server の連続 document navigation 中断を避ける。
    await page.getByRole('link', { name: navigationLabel, exact: true }).click();
    await expect(page).toHaveURL(
      route === '' ? `/agents/${agentId}` : `/agents/${agentId}/${route}`
    );
    await expect(page.locator('body')).toContainText(agentId);
    await expect(page.getByText(/data unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/temporarily unavailable/i)).toHaveCount(0);
  }
});

test('[AGENT-MANAGEMENT-UI-S020] Agent-zero Global Settings signing operations are reachable', async ({
  page,
}) => {
  await ensureDefaultSigningKeyThroughUi(page);

  await expect(page.getByText('Agent-zero availability')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trust Config Export' }).first()).toBeVisible();

  await page.goto('/global-settings/trust-config-export');
  await expect(
    page.getByRole('heading', { name: 'Public-only Trust Config Export' })
  ).toBeVisible();
  await expect(page.getByLabel('Generated trust config JSON')).not.toContainText(
    'No active signing keys'
  );
});

test('[WORKSPACE-GOVERNANCE-S013] Operational smoke reaches Agent RPC real data without browser signing leakage', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await ensureDefaultSigningKeyThroughUi(page);
  await page.goto('/global-settings/trust-config-export');
  await page.getByRole('button', { name: 'Generate public-only JSON' }).click();
  await expect(page.getByText('Schema validation passed')).toBeVisible({ timeout: 15_000 });

  await registerManagedAgentThroughUi(page, agentId);
  await page.goto(`/agents/${agentId}/settings`);
  await page.getByRole('button', { name: 'Run Health Check' }).click();
  await expect(page.getByText('verified', { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.goto(`/agents/${agentId}`);
  await expect(page.getByText('Profile + lifecycle')).toBeVisible();
  await expect(page.getByText('Capabilities')).toBeVisible();
  await expect(page.getByText('Storage & health')).toBeVisible();

  const html = await page.content();
  for (const pattern of FORBIDDEN_BROWSER_SECRET_PATTERNS) {
    expect(html).not.toMatch(pattern);
  }
});
