import { generateIdempotencyKey } from './generate-idempotency-key';
import {
  parseRequestedGrantList,
  type IntegrationInstallFieldErrors,
  type IntegrationInstallValues,
} from './schemas/integration-install';

/**
 * Integration install form から mutation helper が必要とする draft だけを表します。
 *
 * @remarks
 * Browser 側では Integration ID、manifest URL、requested grants、任意の idempotency key だけを保持します。
 * Server Action が Agent RPC と manifest 検証を担当するため、この型に credential material や RPC client を追加してはなりません。
 *
 * @example
 * ```ts
 * const draft: IntegrationInstallDraft = normalizeIntegrationInstallValues(values);
 * ```
 */
export type IntegrationInstallDraft = IntegrationInstallValues;

/**
 * Integration install form の inline validation message 群です。
 *
 * @remarks
 * schema 層の `IntegrationInstallFieldErrors` を mutation helper 側へ公開する alias です。
 * Client-side validation は operator 補助であり、Agent RPC/domain validation が manifest identity、署名、policy、grant acceptance の最終 source of truth です。
 */
export type IntegrationInstallErrors = IntegrationInstallFieldErrors;

/**
 * Integration mutation の成功表示に必要な Browser-safe summary の最小形です。
 *
 * @remarks
 * `installationId` は install 成功時の readout に利用し、`integrationId` は uninstall 成功時に
 * Agent が正規化した ID を返した場合だけ表示します。Agent credential や Adapter Connection の秘密値は
 * 含めません。
 */
export interface IntegrationMutationSummary {
  readonly installationId: string;
  readonly integrationId?: string;
}

/**
 * install confirmation 後に Server Action を呼ぶための依存関係です。
 *
 * @typeParam TInstallation - Server Action が返す Browser-safe installation summary。
 * @remarks
 * UI component から状態 setter を受け取り、mutation 実行中の pending/error/success state を一箇所で更新します。
 * 副作用は React state 更新と渡された Server Action 呼び出しに限定されます。
 */
export interface ConfirmIntegrationInstallInput<TInstallation extends IntegrationMutationSummary> {
  readonly agentId: string;
  readonly installDraft?: IntegrationInstallDraft;
  readonly onInstall: (
    agentId: string,
    idempotencyKey: string,
    integrationId: string,
    manifestRef: string,
    requestedGrants: readonly string[]
  ) => Promise<TInstallation>;
  readonly setError: (value: string | undefined) => void;
  readonly setInstallDraft: (value: IntegrationInstallDraft | undefined) => void;
  readonly setPending: (value: boolean) => void;
  readonly setShowInstall: (value: boolean) => void;
  readonly setSuccess: (value: string | undefined) => void;
}

/**
 * uninstall confirmation 後に Server Action を呼ぶための依存関係です。
 *
 * @typeParam TInstallation - Server Action が返す Browser-safe installation summary。
 * @remarks
 * ConfirmDialog が固定した installation ID だけを処理し、成功時には detail drawer の表示対象も
 * Agent から返された Browser-safe summary に更新します。Browser 側で transport retry や Agent RPC metadata は
 * 組み立てません。副作用は Server Action 呼び出しと React state setter 呼び出しに限定されます。
 */
export interface UninstallIntegrationInput<TInstallation extends IntegrationMutationSummary> {
  readonly agentId: string;
  readonly uninstallId?: string;
  readonly onUninstall: (
    agentId: string,
    installationId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<TInstallation>;
  readonly setError: (value: string | undefined) => void;
  readonly setPending: (value: boolean) => void;
  readonly setSelected: (value: TInstallation | undefined) => void;
  readonly setSuccess: (value: string | undefined) => void;
  readonly setUninstallId: (value: string | undefined) => void;
}

/**
 * Integration install confirmation を Server Action 呼び出しへ変換します。
 *
 * @param input - Agent ID、draft、Server Action、React state setter をまとめた依存関係。
 * @returns 処理完了を表す Promise。draft がない場合は mutation せず解決する。
 * @remarks
 * `requestedGrants` は schema と同じ parser で非空・重複排除済み配列に変換します。Browser は manifest を fetch せず、
 * Agent RPC client や credential metadata も作りません。Server Action が失敗した場合は safe error message だけを state に反映します。
 */
export async function confirmIntegrationInstall<TInstallation extends IntegrationMutationSummary>(
  input: ConfirmIntegrationInstallInput<TInstallation>
): Promise<void> {
  // ConfirmDialog が閉じた後の stale submit は mutation せず終了する。
  if (input.installDraft === undefined) {
    return;
  }
  const requestedGrants = parseRequestedGrantList(input.installDraft.requestedGrants);
  if (requestedGrants.length === 0) {
    input.setError('Add at least one requested grant before installing.');
    return;
  }
  input.setPending(true);
  try {
    // Browser は contract fields だけを渡し、fetch/検証/Agent RPC は Server Action/Agent Worker 側へ閉じる。
    const result = await input.onInstall(
      input.agentId,
      resolveInstallIdempotencyKey(input.installDraft),
      input.installDraft.integrationId,
      input.installDraft.manifestUrl,
      requestedGrants
    );
    input.setSuccess(`Installation ${result.installationId} created.`);
    input.setShowInstall(false);
    input.setInstallDraft(undefined);
  } catch (error_) {
    // Server Action 由来の error message だけを UI に反映し、credential material は扱わない。
    input.setError(error_ instanceof Error ? error_.message : 'Integration install failed.');
  } finally {
    // 成否に関係なく pending を戻し、再操作可能な UI 状態へ復帰する。
    input.setPending(false);
  }
}

/**
 * Integration uninstall confirmation を Server Action 呼び出しへ変換します。
 *
 * @param input - Agent ID、対象 installation ID、Server Action、React state setter をまとめた依存関係。
 * @returns 処理完了を表す Promise。対象 ID がない場合は mutation せず解決する。
 * @remarks
 * destructive action は ConfirmDialog が固定した installation ID がある場合だけ実行します。成功時は Browser-safe summary で
 * detail drawer state を更新し、失敗時は Server Action 由来の safe error message だけを表示状態へ反映します。
 */
export async function uninstallIntegrationFromUi<TInstallation extends IntegrationMutationSummary>(
  input: UninstallIntegrationInput<TInstallation>
): Promise<void> {
  // destructive action は ConfirmDialog が保持する installation ID がある場合だけ実行する。
  if (input.uninstallId === undefined) {
    return;
  }
  input.setPending(true);
  try {
    const result = await input.onUninstall(
      input.agentId,
      input.uninstallId,
      generateIdempotencyKey(),
      'uninstalled from UI'
    );
    input.setSuccess(`Integration ${result.integrationId ?? input.uninstallId} uninstalled.`);
    input.setSelected(result);
    input.setUninstallId(undefined);
  } catch (error_) {
    // Server Action の失敗を UI 状態として提示し、ブラウザで直接 retry transport を組み立てない。
    input.setError(error_ instanceof Error ? error_.message : 'Integration uninstall failed.');
  } finally {
    // Server Action の結果に関係なく pending を解除し、二重 submit を防いだ状態から復帰する。
    input.setPending(false);
  }
}

function resolveInstallIdempotencyKey(draft: IntegrationInstallDraft): string {
  // operator 入力が空なら browser-safe idempotency key を生成し、二重 submit の replay 境界を保つ。
  const trimmedKey = draft.idempotencyKey.trim();
  return trimmedKey === '' ? generateIdempotencyKey() : trimmedKey;
}
