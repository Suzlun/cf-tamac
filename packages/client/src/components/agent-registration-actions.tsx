'use client';

import { Button } from './ui/button';

/**
 * Agent registration form の action row props です。
 *
 * @remarks
 * Browser では cancel と submit の UI 状態だけを扱います。Agent RPC と Client D1 write は親の
 * Server Action callback に閉じます。この値の構築自体は例外を送出せず、callback の失敗は親フォームが
 * Browser-safe result へ正規化します。
 *
 * @example
 * ```tsx
 * const actions: RegistrationActionsProps = {
 *   isEdit: false,
 *   reRegistrationReady: false,
 *   disabled: false,
 *   pending: false,
 *   onCancel: () => router.push('/agents'),
 * };
 * ```
 */
export interface RegistrationActionsProps {
  /** 編集保存の文言を表示する場合は `true`、新規登録または再登録の場合は `false` です。 */
  readonly isEdit: boolean;
  /** not_found cleanup 完了後に保持入力から新しい registration attempt を開始する状態です。 */
  readonly reRegistrationReady: boolean;
  /** ポリシー検証を含む、action row 全体を操作不可にする状態です。 */
  readonly disabled: boolean;
  /** 登録または変更保存そのものが進行中である状態です。 */
  readonly pending: boolean;
  /** キャンセル操作を親フォームへ通知し、安全な一覧遷移を開始する callback です。 */
  readonly onCancel: () => void;
}

/**
 * Agent registration form の cancel/register buttons を描画します。
 *
 * @param props - edit mode、pending 状態、cancel callback を含む props です。
 * @returns form の最後に配置する action row を返します。
 * @throws component 自身は例外を送出しません。`onCancel` の契約外例外は呼び出し元の Error Boundary が処理します。
 * @remarks
 * `aria-disabled` と native `disabled` を状態に応じて使い分け、状態確認中の起点要素とフォーカスを保持します。
 * submit の副作用は親 form の submit handler が所有し、この component は Agent RPC や Client D1 を直接操作しません。
 *
 * @example
 * ```tsx
 * <RegistrationActions
 *   isEdit={false}
 *   reRegistrationReady={false}
 *   disabled={pending}
 *   pending={pending}
 *   onCancel={() => router.push('/agents')}
 * />
 * ```
 */
export function RegistrationActions({
  isEdit,
  reRegistrationReady,
  disabled,
  pending,
  onCancel,
}: RegistrationActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled && !pending}
        aria-disabled={disabled}
        aria-busy={pending}
        onClick={() => {
          // aria-disabled は起点要素を DOM と focus 順へ保持するため、操作拒否は callback 側でも明示します。
          if (!disabled) {
            onCancel();
          }
        }}
      >
        キャンセル
      </Button>
      <Button
        type="submit"
        variant="default"
        className="min-h-11"
        disabled={disabled && !pending}
        aria-disabled={disabled}
        aria-busy={pending}
      >
        {pending
          ? isEdit
            ? '変更を保存しています…'
            : 'Agentを登録しています…'
          : isEdit
            ? '変更を保存'
            : reRegistrationReady
              ? 'Agentを再登録'
              : 'Agentを登録'}
      </Button>
    </div>
  );
}
