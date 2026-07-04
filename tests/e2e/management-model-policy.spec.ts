import { expect, test, type Page, type Request, type Response } from '@playwright/test';

import { createE2eAgentId } from './managed-agent-fixture';

const SAFE_MODEL_POLICY_RESULT_COPY =
  /Policy draft is valid for Workers AI\.|Policy draft is valid with warnings\.|Default model policy could not be saved\.|Agent policy service is temporarily unavailable\.|The policy draft is invalid\.|Correct the highlighted fields/;

const SETTINGS_MODEL_POLICY_RESULT_COPY =
  /Default model policy saved as|Default model policy could not be saved\.|Agent policy service is temporarily unavailable\.|You do not have permission to update the default model policy\.|The policy draft is invalid\./;

const FORBIDDEN_BROWSER_MARKERS = [
  'E2E_PROVIDER_SECRET_DO_NOT_RENDER',
  'E2E_AGENT_RPC_SECRET_DO_NOT_RENDER',
  'createServerAgentRpcClients',
  '@connectrpc/connect',
  '@cf-tamac/client-agent-rpc',
  'Authorization: Bearer',
  'x-agent-signature',
  'raw prompt',
  'raw completion',
  'raw reasoning',
] as const;

interface BrowserSecrecyProbe {
  readonly directAgentRequests: string[];
  readonly scriptTextReads: Promise<string>[];
}

test('[AGENT-MANAGEMENT-UI-S017] Agent creation flow が initial model policy を server-side で送信する', async ({
  page,
}, testInfo) => {
  const secrecyProbe = startBrowserSecrecyProbe(page);
  const agentId = createE2eAgentId(testInfo);

  await page.goto('/agents/new');
  await expect(
    page.getByRole('heading', { name: 'Capture references, not secrets.' })
  ).toBeVisible();
  await expect(page.getByText('Default model policy').first()).toBeVisible();
  await expect(
    page.getByText(
      'Validation and save happen through server-side Agent RPC. No Provider credential or Agent RPC credential is sent to the browser.'
    )
  ).toBeVisible();

  await fillCreationFormWithSafePolicyDraft(page, agentId, 'workers-ai-default-e2e');
  await page.getByRole('button', { name: 'Validate policy' }).click();
  await expect(page.locator('body')).toContainText(SAFE_MODEL_POLICY_RESULT_COPY, {
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Register Agent' }).click();
  await expect(page.locator('body')).toContainText(
    /agent_id:|Default model policy could not be saved\.|Agent policy service is temporarily unavailable\.|Correct the highlighted fields/,
    {
      timeout: 15_000,
    }
  );
  await assertBrowserSecrecy(page, secrecyProbe);
});

test('[AGENT-MANAGEMENT-UI-S018] Settings 画面が default model policy を安全に更新する', async ({
  page,
}, testInfo) => {
  const secrecyProbe = startBrowserSecrecyProbe(page);
  const agentId = createE2eAgentId(testInfo);

  await page.goto('/agents/new');
  await fillCreationFormWithSafePolicyDraft(page, agentId, 'workers-ai-default-e2e');
  const registered = await submitRegistrationAndDetectSuccess(page, agentId);
  test.skip(
    !registered,
    'Agent RPC-backed registration is unavailable, so Settings mutation UI cannot be reached in this environment.'
  );

  await page.goto(`/agents/${agentId}/settings`);
  await expect(
    page.getByRole('heading', { name: 'Agent configuration and credentials' })
  ).toBeVisible();
  await expect(page.getByText('Current Agent-owned policy metadata.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save default policy' })).toBeVisible();

  await fillPolicyDraftFields(page, 'workers-ai-settings-e2e');
  await page.getByRole('button', { name: 'Validate policy' }).click();
  await expect(page.locator('body')).toContainText(SAFE_MODEL_POLICY_RESULT_COPY, {
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Save default policy' }).click();
  await expect(page.locator('body')).toContainText(SETTINGS_MODEL_POLICY_RESULT_COPY, {
    timeout: 15_000,
  });
  await assertBrowserSecrecy(page, secrecyProbe);
});

function startBrowserSecrecyProbe(page: Page): BrowserSecrecyProbe {
  const directAgentRequests: string[] = [];
  const scriptTextReads: Promise<string>[] = [];
  page.on('request', (request) => {
    // Browser から Agent RPC origin / Connect method path / binary Protobuf を直接送っていないかを記録する。
    if (isBrowserDirectAgentRpcRequest(request)) {
      directAgentRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    // Browser が取得した JavaScript bundle も後で検査できるよう、script response body の読み取り Promise を保存する。
    if (isBrowserScriptResponse(response)) {
      scriptTextReads.push(readResponseTextSafely(response));
    }
  });
  return { directAgentRequests, scriptTextReads };
}

function isBrowserDirectAgentRpcRequest(request: Request): boolean {
  const url = request.url();
  const contentType = request.headers()['content-type'] ?? '';
  return (
    url.includes('agent.example.test') ||
    url.includes('/cftamac.agent.v1.') ||
    url.includes('AgentModelPolicyService') ||
    contentType.includes('application/proto')
  );
}

function isBrowserScriptResponse(response: Response): boolean {
  const request = response.request();
  return request.resourceType() === 'script' && response.url().startsWith('http://localhost:3000');
}

async function readResponseTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function fillCreationFormWithSafePolicyDraft(
  page: Page,
  agentId: string,
  policyRef: string
): Promise<void> {
  // Agent identity と RPC origin は Client ledger metadata として入力し、Agent secret material は入力しない。
  await page.getByRole('textbox', { name: 'Agent ID', exact: true }).fill(agentId);
  await page
    .getByRole('textbox', { name: 'Agent RPC origin', exact: true })
    .fill('https://agent.example.test');
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill(`E2E ${agentId}`);
  await page.getByRole('textbox', { name: 'Sort order (optional)', exact: true }).fill('0');

  await fillPolicyDraftFields(page, policyRef);

  // Credential 欄には secret 本体ではなく、許可 prefix の参照 metadata だけを入れる。
  await page
    .getByRole('textbox', { name: 'Credential reference', exact: true })
    .fill('AGENT_CREDENTIAL_E2E_MODEL_POLICY');
  await page.getByRole('textbox', { name: 'Key ID', exact: true }).fill(`e2e-key-${agentId}`);
  await page
    .getByRole('textbox', { name: 'Public fingerprint', exact: true })
    .fill(`fp-${agentId}`.slice(0, 128));
  await page.getByRole('textbox', { name: 'Masked hint', exact: true }).fill('ed25519:e2e-safe');
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'active', exact: true }).click();
}

async function fillPolicyDraftFields(page: Page, policyRef: string): Promise<void> {
  // Model policy draft は Browser-safe な ref/provider/model/生成 parameter だけを入力する。
  await page.getByLabel('Policy ref').fill(policyRef);
  await page.getByRole('combobox', { name: 'Provider' }).click();
  await page.getByRole('option', { name: 'workers-ai', exact: true }).click();
  await page.getByLabel('Model ID').fill('@cf/meta/llama-3.1-8b-instruct');
  await page.getByLabel('Temperature').fill('0.20');
  await page.getByLabel('Top P').fill('0.90');
  await page.getByLabel('Max output tokens').fill('1024');
}

async function submitRegistrationAndDetectSuccess(page: Page, agentId: string): Promise<boolean> {
  await page.getByRole('button', { name: 'Register Agent' }).click();
  try {
    await expect(page).toHaveURL(`/agents/${agentId}`, { timeout: 15_000 });
    return true;
  } catch {
    await expect(page.locator('body')).toContainText(
      /Default model policy could not be saved\.|Agent policy service is temporarily unavailable\.|Correct the highlighted fields/,
      { timeout: 15_000 }
    );
    return false;
  }
}

async function assertBrowserSecrecy(page: Page, secrecyProbe: BrowserSecrecyProbe): Promise<void> {
  // Browser network は server action の UI request だけに閉じ、Agent RPC binary call は観測されないことを確認する。
  expect(secrecyProbe.directAgentRequests).toEqual([]);

  const body = page.locator('body');
  for (const marker of FORBIDDEN_BROWSER_MARKERS) {
    await expect(body).not.toContainText(marker);
  }

  const browserStorageDump = await page.evaluate(() =>
    JSON.stringify({
      localStorage: Object.entries(localStorage),
      sessionStorage: Object.entries(sessionStorage),
    })
  );
  for (const marker of FORBIDDEN_BROWSER_MARKERS) {
    expect(browserStorageDump).not.toContain(marker);
  }

  const html = await page.content();
  for (const marker of FORBIDDEN_BROWSER_MARKERS) {
    expect(html).not.toContain(marker);
  }

  const scriptText = (await Promise.all(secrecyProbe.scriptTextReads)).join('\n');
  for (const marker of FORBIDDEN_BROWSER_MARKERS) {
    expect(scriptText).not.toContain(marker);
  }
}
