import { expect, test, type Page, type Request, type Response } from '@playwright/test';

import {
  createE2eAgentId,
  E2E_APPROVED_AGENT_RPC_ORIGIN,
  ensureDefaultSigningKeyThroughUi,
  expectFocusedOperationResult,
  gotoAgentRegistrationPage,
  gotoManagementRoute,
  registerManagedAgentThroughUi,
  submitManagedAgentRegistration,
} from './managed-agent-fixture';

const SAFE_MODEL_POLICY_RESULT_COPY =
  /ポリシーを検証しました|ポリシーの入力内容を確認しました。|ポリシーの入力内容を確認してください|Agentの接続設定を確認してください|操作を再実行できます/;

const SETTINGS_MODEL_POLICY_RESULT_COPY =
  /既定モデルポリシーを保存しました|既定モデルポリシーを保存できませんでした|Agentの接続設定を確認してください|更新権限を確認してください|操作を再実行できます/;

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

  await ensureDefaultSigningKeyThroughUi(page);
  await gotoAgentRegistrationPage(page);
  await expect(
    page.getByRole('heading', { name: 'サーバー側参照情報でAgentを登録します' })
  ).toBeVisible();
  await expect(page.getByText('既定モデルポリシー').first()).toBeVisible();
  await expect(
    page.getByText(
      '検証と保存はサーバー側Agent RPCで行います。Provider credentialとAgent RPC credentialはブラウザーへ送信しません。'
    )
  ).toBeVisible();

  await fillCreationFormWithSafePolicyDraft(page, agentId, 'workers-ai-default-e2e');
  await page.getByRole('button', { name: 'ポリシーを検証' }).click();
  await expect(page.locator('body')).toContainText(SAFE_MODEL_POLICY_RESULT_COPY, {
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Agentを登録' }).click();
  await expect(page.locator('body')).toContainText(
    /Agentを登録しました|Agentの接続設定を確認してください|操作を再実行できます|強調表示されたフィールド/,
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

  await ensureDefaultSigningKeyThroughUi(page);
  await gotoAgentRegistrationPage(page);
  await fillCreationFormWithSafePolicyDraft(page, agentId, 'workers-ai-default-e2e');
  await submitManagedAgentRegistration(page, agentId);

  await gotoManagementRoute(page, `/agents/${agentId}/settings`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Agent設定とcredential' })).toBeVisible();
  await expect(page.getByText(/Agent所有ポリシーの安全なメタデータを表示します/u)).toBeVisible();
  const savePolicyButton = page.getByRole('button', { name: '既定ポリシーを保存' });
  await expect(savePolicyButton).toBeVisible();
  const savePolicyBox = await savePolicyButton.boundingBox();
  expect(savePolicyBox?.height).toBeGreaterThanOrEqual(44);

  await fillPolicyDraftFields(page, 'workers-ai-settings-e2e');
  await page.getByRole('button', { name: 'ポリシーを検証' }).click();
  await expect(page.locator('body')).toContainText(SAFE_MODEL_POLICY_RESULT_COPY, {
    timeout: 15_000,
  });

  await savePolicyButton.click();
  await expect(page.locator('body')).toContainText(SETTINGS_MODEL_POLICY_RESULT_COPY, {
    timeout: 15_000,
  });
  await assertBrowserSecrecy(page, secrecyProbe);
});

test('[MANAGEMENT-CLIENT-WIREFRAMES-S001] [TAMAC-SDK-S005] Model policy reconciliation keeps the mobile draft and prior summary behind one confirmation action', async ({
  page,
}, testInfo) => {
  const agentId = createE2eAgentId(testInfo);

  await registerManagedAgentThroughUi(page, agentId);
  await gotoManagementRoute(page, `/agents/${agentId}/settings`);
  await page.setViewportSize({ width: 390, height: 844 });
  const summary = page.getByRole('region', { name: '既定モデルポリシー', exact: true });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('workers-ai-default');

  const policyRefInput = page.getByLabel('ポリシー参照');
  // WebKit の Server Component 再描画が draft を初期値へ戻す場合があるため、送信前に Browser DOM の値を確認する。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await policyRefInput.fill('workers-ai-reconciliation');
    try {
      await expect(policyRefInput).toHaveValue('workers-ai-reconciliation');
      break;
    } catch (error) {
      if (attempt > 0) {
        throw error;
      }
    }
  }
  await page.getByRole('button', { name: '既定ポリシーを保存' }).click();
  const resultRegion = await expectFocusedOperationResult(
    page,
    '操作結果を確認してください',
    'alert'
  );
  await expect(resultRegion).toContainText('適用状態を確認');
  await expect(resultRegion.locator('code')).not.toContainText(/private|rawjwt|authorization/i);
  await expect(policyRefInput).toHaveValue('workers-ai-reconciliation');
  await expect(summary).toContainText('workers-ai-default');
  await expect(page.getByRole('button', { name: '既定ポリシーを保存' })).toBeDisabled();

  const reconcileButton = resultRegion.getByRole('button', { name: '適用状態を確認', exact: true });
  await expect(reconcileButton).toHaveCount(1);
  await expect(page.getByRole('button', { name: '登録状態を確認', exact: true })).toHaveCount(0);
  await reconcileButton.click();
  await expectFocusedOperationResult(page, '接続状態を確認してください', 'alert');
  await expect(page.getByRole('button', { name: '適用状態を確認', exact: true })).toHaveCount(1);
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
  // Service Worker 起点の request は frame を持たず、Playwright の request.frame() 呼び出し自体が例外になる。
  if (request.resourceType() !== 'script' || request.serviceWorker() !== null) {
    return false;
  }
  // frame を持つ document script だけを E2E origin と照合し、外部 resource を Browser bundle と誤認しない。
  return new URL(response.url()).origin === new URL(request.frame().url()).origin;
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
  await page.getByLabel('Agent ID', { exact: true }).fill(agentId);
  await page.getByLabel('Agent RPC origin', { exact: true }).fill(E2E_APPROVED_AGENT_RPC_ORIGIN);
  await page.getByLabel('表示名', { exact: true }).fill(`E2E ${agentId}`);
  await page.getByLabel('表示順（任意）', { exact: true }).fill('0');

  await fillPolicyDraftFields(page, policyRef);

  // Credential 欄には secret 本体ではなく、許可 prefix の参照 metadata だけを入れる。
  await page
    .getByLabel('credential参照', { exact: true })
    .fill('AGENT_CREDENTIAL_E2E_MODEL_POLICY');
  await page.getByLabel('キーID', { exact: true }).fill(`e2e-key-${agentId}`);
  await page
    .getByLabel('公開フィンガープリント', { exact: true })
    .fill(`fp-${agentId}`.slice(0, 128));
  await page.getByLabel('マスク済みヒント', { exact: true }).fill('ed25519:e2e-safe');
  await page.getByRole('combobox', { name: '状態' }).click();
  await page.getByRole('option', { name: 'active', exact: true }).click();
}

async function fillPolicyDraftFields(page: Page, policyRef: string): Promise<void> {
  // Model policy draft は Browser-safe な ref/provider/model/生成 parameter だけを入力する。
  await page.getByLabel('ポリシー参照').fill(policyRef);
  await page.getByRole('combobox', { name: 'プロバイダー' }).click();
  await page.getByRole('option', { name: 'workers-ai', exact: true }).click();
  await page.getByLabel('モデルID').fill('@cf/meta/llama-3.1-8b-instruct');
  await page.getByLabel('温度').fill('0.20');
  await page.getByLabel('Top P').fill('0.90');
  await page.getByLabel('最大出力トークン数').fill('1024');
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
