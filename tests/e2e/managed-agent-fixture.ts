import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * E2E ごとに一意な managed Agent ID を生成します。
 *
 * @param testInfo - Playwright が提供する test metadata です。parallel worker と retry を含め、同時実行時の衝突を避けます。
 * @returns Client D1 registry に登録する lowercase kebab-case の Agent ID です。
 * @remarks
 * ローカル D1 は E2E 実行間で残る場合があるため、実行時刻を suffix に含めます。外部 secret や Agent RPC は使わず、
 * Client registry UI の登録 flow だけを通して detail route の前提を作ります。
 */
export function createE2eAgentId(testInfo: TestInfo): string {
  const titleSlug = testInfo.title
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 28);
  const workerIndex = String(testInfo.workerIndex);
  const retry = String(testInfo.retry);
  const timestamp = String(Date.now());
  const stableTitleSlug = titleSlug.length > 0 ? titleSlug : 'scenario';
  return `e2e-${workerIndex}-${retry}-${timestamp}-${stableTitleSlug}`.slice(0, 63);
}

/**
 * Management Client の UI 登録 flow で managed Agent を作成します。
 *
 * @param page - 操作対象の Playwright page です。
 * @param agentId - 登録する Agent ID です。
 * @returns 登録後に表示される Agent detail route の URL 検証まで完了した Promise です。
 * @remarks
 * 直接 D1 を書かず、Add Agent form、Server Action、Client D1 repository の境界を通します。credential は参照値と公開 metadata だけを
 * 入力し、secret material や remote/staging origin は使いません。
 */
export async function registerManagedAgentThroughUi(page: Page, agentId: string): Promise<void> {
  await ensureDefaultSigningKeyThroughUi(page);
  await page.goto('/agents/new');

  // Client component の hydration が入力値を上書きしないよう、フォーム見出しが操作可能になるまで待つ。
  await expect(
    page.getByRole('heading', { name: 'Capture references, not secrets.' })
  ).toBeVisible();

  // Agent ID は登録後 route と D1 primary key の前提なので、入力直後と送信直前の両方で値を確認する。
  const agentIdInput = page.getByRole('textbox', { name: 'Agent ID', exact: true });
  await agentIdInput.fill(agentId);
  await expect(agentIdInput).toHaveValue(agentId);

  // RPC origin は外部通信を発生させない example domain に固定し、Client D1 の metadata 保存だけを通す。
  await page
    .getByRole('textbox', { name: 'Agent RPC origin', exact: true })
    .fill('https://agent.example.test');
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill(`E2E ${agentId}`);
  await page.getByRole('textbox', { name: 'Sort order (optional)', exact: true }).fill('0');

  // Credential は secret 本体ではなく参照値と公開 metadata だけを入力し、Client の secrecy boundary を維持する。
  await page
    .getByRole('textbox', { name: 'Credential reference', exact: true })
    .fill(`local-ref-${agentId}`);
  await page
    .getByRole('textbox', { name: 'Key ID', exact: true })
    .fill(`local-key-${agentId}`.slice(0, 128));
  await page
    .getByRole('textbox', { name: 'Public fingerprint', exact: true })
    .fill(`fp-${agentId}`.slice(0, 128));
  await page
    .getByRole('textbox', { name: 'Masked hint', exact: true })
    .fill(`ed25519:${agentId.slice(-8)}`.slice(0, 64));
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'active', exact: true }).click();

  // Server Action へ渡す直前にも必須 ID を再入力し、WebKit の hydration / 再描画による値落ちを失敗原因から外す。
  await agentIdInput.fill(agentId);
  await expect(agentIdInput).toHaveValue(agentId);
  await submitRegistrationWithAgentIdRecovery(page, agentIdInput, agentId);
}

async function submitRegistrationWithAgentIdRecovery(
  page: Page,
  agentIdInput: Locator,
  agentId: string
): Promise<void> {
  // WebKit は長い multi-project run の終盤で controlled input の値が送信直前に落ちる場合があるため、
  // Agent ID required の validation だけを再入力対象として扱う。その他の form error は本当の失敗として残す。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: 'Register Agent' }).click();
    try {
      // ローカル D1 書き込みと redirect を待ち、以降の tests が登録済み detail route を前提にできるようにする。
      await expect(page).toHaveURL(`/agents/${agentId}`, { timeout: 15_000 });
      return;
    } catch (error) {
      const agentIdRequired = await page
        .getByText('Agent ID is required.', { exact: true })
        .count();
      if (attempt > 0 || agentIdRequired === 0) {
        throw error;
      }
      await agentIdInput.fill(agentId);
      await expect(agentIdInput).toHaveValue(agentId);
    }
  }
}

/**
 * Management Client の Global Settings UI だけを使って既定 signing key を用意します。
 *
 * @param page - 操作対象の Playwright page です。
 * @returns 既定 key が存在する状態まで UI 操作を完了した Promise です。
 * @remarks
 * Agent 登録 Server Action は default signing key を前提に fail-closed するため、E2E fixture も D1 直書きではなく
 * 署名鍵管理画面の positive surface から前提を作ります。private JWK や raw JWT は Browser で扱いません。
 */
export async function ensureDefaultSigningKeyThroughUi(page: Page): Promise<void> {
  await page.goto('/global-settings/signing-keys');
  await expect(page.getByRole('heading', { name: 'Client Service Signing Keys' })).toBeVisible();

  // key が 0 件の場合は Global Settings の公開 UI から生成し、server-only action と D1 repository の境界を通す。
  const signingKeyTable = page.getByRole('table');
  const signingKeyRowCount =
    (await signingKeyTable.count()) === 0 ? 0 : await signingKeyTable.getByRole('row').count();
  if (signingKeyRowCount <= 1) {
    await page.getByRole('button', { name: 'Generate Key' }).first().click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });
  }

  // 既定 key がない状態では操作可能な Set default button が出るため、見出し text ではなく button 有無で既定化を判断する。
  const setDefaultButton = page.getByRole('button', { name: 'Set default' }).first();
  if ((await setDefaultButton.count()) > 0) {
    await setDefaultButton.click();
    await expect(page.getByText('Default', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  }
}
