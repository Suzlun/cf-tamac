import { expect, type Page, type TestInfo } from '@playwright/test';

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
  await page.goto('/agents/new');

  // Client component の hydration が入力値を上書きしないよう、フォーム見出しが操作可能になるまで待つ。
  await expect(
    page.getByRole('heading', { name: 'Capture references, not secrets.' })
  ).toBeVisible();

  // Agent ID は登録後 route と D1 primary key の前提なので、入力直後と送信直前の両方で値を確認する。
  const agentIdInput = page.getByRole('textbox', { name: 'Agent ID', exact: true });
  await agentIdInput.click();
  await agentIdInput.pressSequentially(agentId);
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
  await page.getByLabel('Status').selectOption('active');

  // Server Action へ渡す直前にも必須 ID が保持されていることを確認し、WebKit の入力反映揺れを失敗原因から外す。
  await expect(agentIdInput).toHaveValue(agentId);
  await page.getByRole('button', { name: 'Register Agent' }).click();

  // ローカル D1 書き込みと redirect を待ち、以降の tests が登録済み detail route を前提にできるようにする。
  await expect(page).toHaveURL(`/agents/${agentId}`, { timeout: 15_000 });
}
