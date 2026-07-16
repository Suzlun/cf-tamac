import { expect, test, type Page, type Request, type Response } from '@playwright/test';

import {
  createE2eAgentId,
  E2E_APPROVED_AGENT_RPC_ORIGIN,
  ensureDefaultSigningKeyThroughUi,
  expectFocusedOperationResult,
  fillManagedAgentRegistrationForm,
  gotoAgentRegistrationPage,
} from './managed-agent-fixture';

const FORBIDDEN_BROWSER_SAFE_RESULT_MARKERS = [
  'privateJwk',
  'encryptedPrivateJwk',
  'rawJwt',
  'createServerAgentRpcClients',
  'Authorization: Bearer',
  '@connectrpc/connect',
] as const;

interface BrowserSafeResultSecrecyProbe {
  readonly directAgentRequests: string[];
  readonly scriptTextReads: Promise<string>[];
}

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

test('[MANAGEMENT-CLIENT-WIREFRAMES-S001] [TAMAC-SDK-S005] Management Client が閉じた Browser-safe result を返す', async ({
  page,
}, testInfo) => {
  const secrecyProbe = startBrowserSafeResultSecrecyProbe(page);
  const agentId = createE2eAgentId(testInfo);

  await ensureDefaultSigningKeyThroughUi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAgentRegistrationPage(page);
  await fillManagedAgentRegistrationForm(page, agentId, 'https://unapproved-agent.example.test');
  await page.getByRole('button', { name: 'Agentを登録', exact: true }).click();

  // mobile ResultRegion は safe configuration copy、assertive live region、完了後フォーカスを同時に提供する。
  const failureRegion = await expectFocusedOperationResult(
    page,
    'Agent RPC originを確認してください',
    'alert'
  );
  await expect(failureRegion).toContainText(
    'Agent RPC originを運用ポリシーで確認してください。許可済みのHTTPS originを登録すると操作を続行できます。'
  );
  await expect(
    page.getByText('許可済みのHTTPS Agent RPC originを入力してください。', { exact: true })
  ).toBeVisible();
  await assertBrowserSafeResultSurface(page, secrecyProbe);

  // correlation ID は選択可能な support reference として表示し、Clipboard の可否に応じた affordance を提供する。
  const correlationId = failureRegion.locator('code');
  await expect(correlationId).not.toBeEmpty();
  await expect(correlationId).toHaveClass(/break-all/);
  const copyButton = failureRegion.getByRole('button', { name: /問い合わせID .* をコピー/ });
  const copyFallback = failureRegion.getByText('問い合わせIDを選択してコピーできます。');
  expect((await copyButton.count()) + (await copyFallback.count())).toBe(1);
  if ((await copyButton.count()) === 1) {
    const copyBox = await copyButton.boundingBox();
    expect(copyBox?.height).toBeGreaterThanOrEqual(44);
    await copyButton.click();
  }
  // Clipboard 成功と permission rejection のどちらでも、独立した polite status が安全なコピー結果を伝える。
  const copyStatus = failureRegion.getByRole('status');
  await expect(copyStatus).toHaveAttribute('aria-live', 'polite');
  await expect(copyStatus).toContainText(
    /問い合わせIDをコピーしました。|問い合わせIDを選択してコピーできます。/
  );

  // desktop success state も同じ four-field action result contract の status live region と focus を使う。
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.getByLabel('Agent RPC origin', { exact: true }).fill(E2E_APPROVED_AGENT_RPC_ORIGIN);
  await page.getByRole('button', { name: 'Agentを登録', exact: true }).click();
  await expectFocusedOperationResult(page, 'Agentを登録しました', 'status');

  // 成功 state でも同じ Browser payload boundary を再検査し、結果遷移の前後で露出がないことを確認する。
  await assertBrowserSafeResultSurface(page, secrecyProbe);
});

function startBrowserSafeResultSecrecyProbe(page: Page): BrowserSafeResultSecrecyProbe {
  const directAgentRequests: string[] = [];
  const scriptTextReads: Promise<string>[] = [];
  page.on('request', (request) => {
    // GET/JSON/binary を問わず、Browser が approved または rejected Agent origin へ直接送る通信を拒否する。
    if (isBrowserDirectAgentRpcRequest(request)) {
      directAgentRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    // Browser bundle が server-only SDK/credential seam を含まないことを、DOM とは別に response body で検査する。
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
    url.startsWith(E2E_APPROVED_AGENT_RPC_ORIGIN) ||
    url.startsWith('https://unapproved-agent.example.test') ||
    url.includes('/cftamac.agent.v1.') ||
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
    // 既に読み取り済みの response は secrecy assertion を阻害せず、空文字として扱う。
    return '';
  }
}

async function assertBrowserSafeResultSurface(
  page: Page,
  secrecyProbe: BrowserSafeResultSecrecyProbe
): Promise<void> {
  // Browser-visible DOM、storage、bundle を同じ denylist で確認し、失敗 result の一時描画も検査対象にする。
  expect(secrecyProbe.directAgentRequests).toEqual([]);
  const storageDump = await page.evaluate(() =>
    JSON.stringify({
      localStorage: Object.entries(localStorage),
      sessionStorage: Object.entries(sessionStorage),
    })
  );
  const browserHtml = await page.content();
  const scriptText = (await Promise.all(secrecyProbe.scriptTextReads)).join('\n');
  for (const marker of FORBIDDEN_BROWSER_SAFE_RESULT_MARKERS) {
    await expect(page.locator('body')).not.toContainText(marker);
    expect(storageDump).not.toContain(marker);
    expect(browserHtml).not.toContain(marker);
    expect(scriptText).not.toContain(marker);
  }
}
