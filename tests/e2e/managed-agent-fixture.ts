import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * E2E の Client Worker 設定で許可する canonical HTTPS Agent RPC origin です。
 *
 * @remarks
 * Browser 入力の正規化を検証する各 scenario は、この server-managed allowlist の canonical 値を
 * 基準にします。E2E fake RPC により外部 Agent Worker への通信は発生しません。
 */
export const E2E_APPROVED_AGENT_RPC_ORIGIN = 'https://cf-tamac-agent.example.workers.dev';

/**
 * E2E ごとに一意な managed Agent ID を生成します。
 *
 * @param testInfo - Playwright が提供する test metadata です。parallel worker と retry を含め、同時実行時の衝突を避けます。
 * @returns Client D1 registry に登録する lowercase kebab-case の Agent ID です。
 * @remarks
 * ローカル D1 は E2E 実行間で残る場合があるため、実行時刻を suffix に含めます。外部 secret や Agent RPC は使わず、
 * Client registry UI の登録 flow だけを通して detail route の前提を作ります。
 */
export function createE2eAgentId(testInfo: TestInfo, prefix = 'e2e'): string {
  const titleSlug = testInfo.title
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 28);
  const workerIndex = String(testInfo.workerIndex);
  const retry = String(testInfo.retry);
  const timestamp = String(Date.now());
  const stableTitleSlug = titleSlug.length > 0 ? titleSlug : 'scenario';
  return `${prefix}-${workerIndex}-${retry}-${timestamp}-${stableTitleSlug}`.slice(0, 63);
}

/**
 * 完了した Browser-safe 操作結果がアクセシブルな通知とフォーカスを提供することを確認します。
 *
 * @param page - 操作結果を表示する Playwright page です。
 * @param headingName - result heading に表示される固定安全文言です。
 * @param role - 成功時の `status` または safe failure 時の `alert` です。
 * @returns result heading の親 notification container を返します。
 * @remarks
 * success、safe failure、状態確認の完了結果は同じ `OperationResultRegion` を使用します。この helper は
 * heading の `tabindex=-1`、programmatic focus、ancestor role と live-region atomicity を E2E で同時に
 * 検証し、DOM source の文字列確認だけに依存しません。
 */
export async function expectFocusedOperationResult(
  page: Page,
  headingName: string,
  role: 'alert' | 'status'
): Promise<Locator> {
  const heading = page.getByRole('heading', { name: headingName });
  const region = heading.locator('..');
  await expect(region).toHaveAttribute('role', role);
  await expect(region).toHaveAttribute('aria-atomic', 'true');
  if (role === 'status') {
    await expect(region).toHaveAttribute('aria-live', 'polite');
  }
  await expect(heading).toHaveAttribute('tabindex', '-1');
  await expect(heading).toBeFocused();
  return region;
}

/**
 * Server Action の同一origin再検証後にAgent登録画面へ遷移します。
 *
 * @param page - 操作対象の Playwright page です。
 * @returns `/agents/new` の load 完了まで待つ Promise です。
 * @throws Server Action の再検証競合以外の navigation error を送出します。
 * @remarks
 * WebKit が同一originの Server Action navigation と次の `page.goto` を同時に観測した場合だけ、1回待機して再実行します。
 * E2E の実際のページ遷移・form submit・Server Action は変更せず、既知の browser scheduling race だけを安定化します。
 */
export async function gotoAgentRegistrationPage(page: Page): Promise<void> {
  await gotoAgentRoute(page, '/agents/new');
}

/**
 * Server Action 後の既知の同一origin navigation 競合を避けて managed Agent route へ移動します。
 *
 * @param page - 操作対象の Playwright page です。
 * @param path - `/agents/...` 配下の E2E route です。
 * @returns 指定 route の load 完了まで待つ Promise です。
 * @throws 既知の navigation interruption 以外の error を送出します。
 * @remarks
 * Server Action による RSC refresh が直前 route の navigation を遅延させる場合があるため、該当する Playwright
 * error だけを1回再試行します。別の失敗を待機や再送で隠さないことで、実際の UI/Server Action failure を保持します。
 */
export async function gotoAgentRoute(page: Page, path: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt > 0 || !message.includes('interrupted by another navigation')) {
        throw error;
      }
      await page.waitForTimeout(250);
      await page.waitForLoadState('load').catch(() => undefined);
    }
  }
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
  await gotoAgentRegistrationPage(page);
  await fillManagedAgentRegistrationForm(page, agentId);
  await submitManagedAgentRegistration(page, agentId);

  // 成功結果を確認してから detail 導線を使い、後続 E2E が登録済み Agent を前提にできる状態へ遷移する。
  await page.getByRole('link', { name: 'Agentの概要を開く', exact: true }).click();
  await expect(page).toHaveURL(`/agents/${agentId}`, { timeout: 15_000 });
  // detail navigation の document/RSC 更新が完了してから、呼び出し元が settings 等へ移動できるようにする。
  await page.waitForLoadState('networkidle');
}

/**
 * Management Client の登録フォームへ browser-safe な管理対象 Agent metadata を入力します。
 *
 * @param page - 操作対象の Playwright page です。
 * @param agentId - 登録する lowercase kebab-case の Agent ID です。
 * @param agentRpcOrigin - allowlist と照合する HTTPS Agent RPC origin 入力です。
 * @returns フォームの必須値をすべて入力した Promise です。
 * @remarks
 * 入力する credential は参照値と公開 metadata だけです。secret material、private JWK、raw JWT は
 * 入力・生成・検査しません。
 */
export async function fillManagedAgentRegistrationForm(
  page: Page,
  agentId: string,
  agentRpcOrigin = E2E_APPROVED_AGENT_RPC_ORIGIN
): Promise<void> {
  // Client component の hydration が入力値を上書きしないよう、フォーム見出しが操作可能になるまで待つ。
  await expect(
    page.getByRole('heading', { name: 'サーバー側参照情報でAgentを登録します' })
  ).toBeVisible();

  // Agent ID は登録後 route と D1 primary key の前提なので、入力直後と送信直前の両方で値を確認する。
  const agentIdInput = page.getByLabel('Agent ID', { exact: true });
  await agentIdInput.fill(agentId);
  await expect(agentIdInput).toHaveValue(agentId);

  // RPC origin は E2E fake RPC が外部通信を抑止した状態で、Client D1 metadata と origin policy の境界を通す。
  await page.getByLabel('Agent RPC origin', { exact: true }).fill(agentRpcOrigin);
  await page.getByLabel('表示名', { exact: true }).fill(`E2E ${agentId}`);
  await page.getByLabel('表示順（任意）', { exact: true }).fill('0');

  // Credential は secret 本体ではなく参照値と公開 metadata だけを入力し、Client の secrecy boundary を維持する。
  await page.getByLabel('credential参照', { exact: true }).fill(`local-ref-${agentId}`);
  await page.getByLabel('キーID', { exact: true }).fill(`local-key-${agentId}`.slice(0, 128));
  await page
    .getByLabel('公開フィンガープリント', { exact: true })
    .fill(`fp-${agentId}`.slice(0, 128));
  await page
    .getByLabel('マスク済みヒント', { exact: true })
    .fill(`ed25519:${agentId.slice(-8)}`.slice(0, 64));
  await page.getByRole('combobox', { name: '状態' }).click();
  await page.getByRole('option', { name: 'active', exact: true }).click();

  // Server Action へ渡す直前にも必須 ID を再入力し、WebKit の hydration / 再描画による値落ちを失敗原因から外す。
  await agentIdInput.fill(agentId);
  await expect(agentIdInput).toHaveValue(agentId);
}

/**
 * 入力済みの登録フォームを送信し、Browser-safe 成功結果まで待機します。
 *
 * @param page - 操作対象の Playwright page です。
 * @param agentId - hydration recovery 時に再設定する Agent ID です。
 * @returns `Agentを登録しました` の結果見出しが表示される Promise です。
 * @remarks
 * 登録成功は同一 route の ResultRegion で確認し、登録後の遷移は呼び出し元が明示的に選択します。
 * これにより成功 result の live region と focus を scenario ごとに検証できます。
 */
export async function submitManagedAgentRegistration(page: Page, agentId: string): Promise<void> {
  const agentIdInput = page.getByLabel('Agent ID', { exact: true });

  // WebKit は長い multi-project run の終盤で controlled input の値が送信直前に落ちる場合があるため、
  // Agent ID required の validation だけを再入力対象として扱う。その他の form error は本当の失敗として残す。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: 'Agentを登録', exact: true }).click();
    try {
      // Server Action の four-field success result が ResultRegion へ適用されるまで待つ。
      await expect(page.getByRole('heading', { name: 'Agentを登録しました' })).toBeVisible({
        timeout: 15_000,
      });
      return;
    } catch (error) {
      const agentIdRequired = await page
        .getByText('Agent IDを入力してください。', { exact: true })
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
 * 登録結果が成功または reconciliation required になるまで登録 submit を実行します。
 *
 * @param page - 操作対象の Playwright page です。
 * @param agentId - hydration recovery 時に再設定する Agent ID です。
 * @returns 登録 Server Action の success または未確定結果が描画されるまで完了する Promise です。
 * @remarks
 * WebKit で controlled input が submit 直前に空になる既知の局所競合だけを再入力で回復します。
 * その他の validation failure は再試行せず、E2E の失敗として残します。Server Action は一度だけ発行されるため、
 * reconciliation required の場合も InitializeAgent を Browser から再送しません。
 */
export async function submitManagedAgentRegistrationAttempt(
  page: Page,
  agentId: string
): Promise<void> {
  const agentIdInput = page.getByLabel('Agent ID', { exact: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: 'Agentを登録', exact: true }).click();
    await expect(page.locator('body')).toContainText(
      /登録状態を確認してください|Agentを登録しました|Agent IDを入力してください。/u,
      { timeout: 15_000 }
    );
    if ((await page.getByText('Agent IDを入力してください。', { exact: true }).count()) > 0) {
      if (attempt > 0) {
        throw new Error('Agent ID was cleared twice before registration submit.');
      }
      await agentIdInput.fill(agentId);
      await expect(agentIdInput).toHaveValue(agentId);
      continue;
    }
    return;
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
  // signing key Server Action の再検証 navigation が完了してから、次の登録 route へ移動できる状態を作る。
  await page.goto('/global-settings/signing-keys', { waitUntil: 'networkidle' });
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

  // Server Action の再検証 navigation が完了するまで待ち、直後の /agents/new navigation と競合させない。
  await page.waitForLoadState('networkidle');
}
