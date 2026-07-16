'use client';

import { Button } from './ui/button';

/**
 * Agent registration form の action row props です。
 *
 * @remarks
 * Browser では cancel と submit の UI 状態だけを扱います。Agent RPC と Client D1 write は親の
 * Server Action callback に閉じます。
 */
export interface RegistrationActionsProps {
  readonly isEdit: boolean;
  /** not_found cleanup 完了後に保持入力から新しい registration attempt を開始する状態です。 */
  readonly reRegistrationReady: boolean;
  /** ポリシー検証を含む、action row 全体を操作不可にする状態です。 */
  readonly disabled: boolean;
  /** 登録または変更保存そのものが進行中である状態です。 */
  readonly pending: boolean;
  readonly onCancel: () => void;
}

/**
 * Agent registration form の cancel/register buttons を描画します。
 *
 * @param props - edit mode、pending 状態、cancel callback を含む props です。
 * @returns form の最後に配置する action row を返します。
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
