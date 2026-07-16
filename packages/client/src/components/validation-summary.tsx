'use client';

import { Button } from './ui/button';

/**
 * Browser 入力検証で表示する field anchor です。
 *
 * @typeParam TFieldName - RHF または別の form controller が管理する field 名です。
 * @remarks
 * message は Browser-safe に整形済みであり、Server Action の raw diagnostic を含みません。
 */
export interface ValidationSummaryItem<TFieldName extends string = string> {
  readonly fieldName: TFieldName;
  readonly label: string;
  readonly message: string;
}

/**
 * Browser validation の通知と修正対象 field anchor を共有表示します。
 *
 * @typeParam TFieldName - focus callback に渡す field 名です。
 * @param props - form-level message、field anchor、focus callback を含む props です。
 * @returns `role="alert"` の検証概要、または表示対象がない場合の null を返します。
 * @remarks
 * Server Action 完了結果は `OperationResultRegion` が所有し、この component は Browser 検証時だけ通知します。
 */
export function ValidationSummary<TFieldName extends string>({
  heading = '登録内容を確認してください',
  formError,
  items,
  onFocusField,
}: {
  readonly heading?: string;
  readonly formError: string | undefined;
  readonly items: readonly ValidationSummaryItem<TFieldName>[];
  readonly onFocusField: (fieldName: TFieldName) => void;
}) {
  if (formError === undefined && items.length === 0) {
    return null;
  }
  return (
    <div
      className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      <h3 className="font-medium">{heading}</h3>
      <p className="mt-1">
        {formError ?? '強調表示されたフィールドを確認すると登録を続行できます。'}
      </p>
      {items.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs">
          {items.map((item) => (
            <li key={item.fieldName}>
              <Button asChild variant="link" className="h-auto p-0 text-left">
                <a
                  href={`#${item.fieldName}`}
                  onClick={() => {
                    // native anchor の URL/scroll semantics を保ちつつ、click/Enter 後に対象 field へ focus を戻します。
                    onFocusField(item.fieldName);
                  }}
                >
                  {item.label}: {item.message}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
