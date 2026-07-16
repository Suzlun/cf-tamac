'use client';

import { Button } from './ui/button';
import {
  FormControl,
  FormDescription,
  FormField as RhfFormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import type { BrowserSafeModelPolicyWarning, ModelPolicyFieldName } from './schemas/model-policy';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/**
 * モデルポリシー編集領域の表示 mode です。
 *
 * @remarks
 * `create` は登録フォーム内の初期ポリシー、`settings` は選択済み Agent の既定ポリシーを表します。
 * 表示文言と初期状態だけを分岐し、server-only Agent RPC の実行経路は変えません。
 */
export type ModelPolicyMode = 'create' | 'settings';

/**
 * モデルポリシー検証 UI が表示する安全な状態です。
 *
 * @remarks
 * 値は Browser 内の入力・待機状態または Server Action が返す Browser-safe result にだけ対応します。
 * SDK error、credential、raw transport detail はこの union へ含めません。
 */
export type ModelPolicyValidationStatus =
  | 'idle'
  | 'validating'
  | 'valid'
  | 'warning'
  | 'invalid'
  | 'permission_denied'
  | 'unavailable';

/**
 * React Hook Form field 名を model policy の論理 field へ対応付けます。
 *
 * @typeParam TValues - 親 form が保持する値の型です。
 * @remarks
 * Registration では `modelPolicy.policyRef` のような nested path、Settings では `policyRef` のような
 * flat path を渡します。component は path だけを受け取り、server-only module や Agent RPC client は
 * import しません。
 */
export interface ModelPolicyFieldNameMap<TValues extends FieldValues> {
  readonly policyRef: Path<TValues>;
  readonly provider: Path<TValues>;
  readonly model: Path<TValues>;
  readonly temperature: Path<TValues>;
  readonly topP: Path<TValues>;
  readonly maxOutputTokens: Path<TValues>;
}

/**
 * `ModelPolicyFields` の browser-safe props です。
 *
 * @typeParam TValues - 親 form の値型です。
 * @remarks
 * props は draft 値、validation 状態、safe warning だけを扱います。Agent credential、Provider secret、
 * direct RPC transport、generated descriptor は渡さず、親 Server Action callback へ委譲します。
 */
export interface ModelPolicyFieldsProps<TValues extends FieldValues> {
  readonly form: UseFormReturn<TValues>;
  readonly names: ModelPolicyFieldNameMap<TValues>;
  readonly mode: ModelPolicyMode;
  readonly disabled: boolean;
  readonly validationStatus: ModelPolicyValidationStatus;
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
  readonly onValidate?: () => void;
}

/**
 * Default model policy の browser-safe field group を描画します。
 *
 * @typeParam TValues - 親 form の値型です。
 * @param props - React Hook Form instance、field name map、表示 mode、disabled 状態、safe warning を含む props です。
 * @returns Agent-owned default model policy draft を入力する `<fieldset>` を返します。
 * @remarks
 * この component はブラウザで表示と入力状態だけを扱います。Agent RPC、credential 解決、D1 write、
 * generated descriptor import は server-side action に閉じ、ここでは server-only 境界 helper copy だけを表示します。
 */
export function ModelPolicyFields<TValues extends FieldValues>({
  form,
  names,
  mode,
  disabled,
  validationStatus,
  warnings,
  onValidate,
}: ModelPolicyFieldsProps<TValues>) {
  const pending = validationStatus === 'validating';
  const statusCopy = resolveStatusCopy(mode, validationStatus, warnings.length);
  const validateDisabled = disabled || pending || onValidate === undefined;

  return (
    <fieldset
      aria-describedby="model-policy-helper model-policy-boundary-helper"
      className="rounded-md bg-muted px-3 py-2 text-sm space-y-1"
    >
      {/* legend を唯一の見出しとして使い、fieldset のアクセシブル名と可視の見出しを一致させます。 */}
      <legend
        id="model-policy-heading"
        className="flex w-full items-center justify-between border-b pb-3 font-medium"
      >
        <span>既定モデルポリシー</span>
        <span className="text-primary">
          {mode === 'create' ? '作成時に有効' : 'サーバー側で処理'}
        </span>
      </legend>
      <p id="model-policy-helper" className="text-xs text-foreground">
        AgentConfig.modelPolicyRefで参照するAgent所有ポリシーを設定します。安全化済みの参照、プロバイダー、モデル、パラメーター、状態、警告、ダイジェストだけを表示します。
      </p>
      <p id="model-policy-boundary-helper" className="text-xs text-foreground">
        検証と保存はサーバー側Agent RPCで行います。Provider credentialとAgent RPC
        credentialはブラウザーへ送信しません。
      </p>
      <p aria-live="polite" className="text-xs text-foreground">
        {statusCopy}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <PolicyTextField
          form={form}
          name={names.policyRef}
          label="ポリシー参照"
          helper="AgentConfig.modelPolicyRefで参照するAgent所有ID。小文字のkebab-caseで入力してください。"
          disabled={disabled || pending}
          required
        />
        <ProviderField form={form} name={names.provider} disabled={disabled || pending} />
        <PolicyTextField
          form={form}
          name={names.model}
          label="モデルID"
          helper="Workers AI model ID。保存前にAgentが利用可否を検証します。"
          disabled={disabled || pending}
          required
        />
        <PolicyTextField
          form={form}
          name={names.temperature}
          label="温度"
          helper="0.00〜2.00。小さい値ほど出力が安定します。"
          disabled={disabled || pending}
          inputMode="decimal"
          type="number"
          required
        />
        <PolicyTextField
          form={form}
          name={names.topP}
          label="Top P"
          helper="0.01〜1.00のnucleus sampling上限です。"
          disabled={disabled || pending}
          inputMode="decimal"
          type="number"
          required
        />
        <PolicyTextField
          form={form}
          name={names.maxOutputTokens}
          label="最大出力トークン数"
          helper="1回のmodel callで返すtoken数を1〜8192で指定します。"
          disabled={disabled || pending}
          inputMode="numeric"
          type="number"
          required
        />
      </div>
      <WarningList warnings={warnings} />
      {onValidate !== undefined ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className={`min-h-11${validateDisabled ? ' opacity-50' : ''}`}
            disabled={validateDisabled && !pending}
            aria-disabled={validateDisabled}
            aria-busy={pending}
            onClick={() => {
              // native disabled は起点 focus を失わせるため、二重実行拒否を callback 境界で行います。
              if (!validateDisabled) {
                onValidate();
              }
            }}
          >
            {pending ? 'ポリシーを検証しています…' : 'ポリシーを検証'}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

interface PolicyTextFieldProps<TValues extends FieldValues> {
  readonly form: UseFormReturn<TValues>;
  readonly name: Path<TValues>;
  readonly label: string;
  readonly helper: string;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly inputMode?: 'numeric' | 'decimal';
  readonly type?: 'number' | 'text';
}

function PolicyTextField<TValues extends FieldValues>({
  form,
  name,
  label,
  helper,
  disabled,
  required,
  inputMode,
  type = 'text',
}: PolicyTextFieldProps<TValues>) {
  return (
    <RhfFormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {/* 登録フォームの ValidationSummary anchor が nested RHF path と同じ input を指せるよう ID を固定します。 */}
          <FormLabel htmlFor={name}>{label}</FormLabel>
          <FormDescription className="text-foreground">{helper}</FormDescription>
          <FormControl>
            <Input
              {...field}
              autoComplete="off"
              className="h-11"
              disabled={disabled}
              id={name}
              inputMode={inputMode}
              required={required}
              type={type}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ProviderField<TValues extends FieldValues>({
  form,
  name,
  disabled,
}: {
  readonly form: UseFormReturn<TValues>;
  readonly name: Path<TValues>;
  readonly disabled: boolean;
}) {
  return (
    <RhfFormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {/* Select trigger にも field path を ID として付け、検証概要の anchor/focus 導線を成立させます。 */}
          <FormLabel htmlFor={name}>プロバイダー</FormLabel>
          <FormDescription className="text-foreground">
            この画面ではworkers-aiを選択できます。Provider credentialはサーバー側が所有します。
          </FormDescription>
          <Select
            value={field.value}
            onValueChange={field.onChange}
            disabled={disabled}
            name={field.name}
            required
          >
            <FormControl>
              <SelectTrigger ref={field.ref} id={name} className="h-11" aria-label="プロバイダー">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="workers-ai">workers-ai</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function WarningList({
  warnings,
}: {
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
}) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      role="status"
      aria-live="polite"
    >
      <strong>ポリシー検証の警告</strong>
      <ul className="mt-2 list-disc pl-5 text-xs">
        {warnings.map((warning) => (
          <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
        ))}
      </ul>
    </div>
  );
}

function resolveStatusCopy(
  mode: ModelPolicyMode,
  validationStatus: ModelPolicyValidationStatus,
  warningCount: number
): string {
  if (validationStatus === 'validating') return 'ポリシーを検証しています…';
  if (validationStatus === 'valid') return 'ポリシーの入力内容を確認しました。';
  if (validationStatus === 'warning' || warningCount > 0) {
    return 'ポリシーの入力内容に警告があります。';
  }
  if (validationStatus === 'invalid') return 'ポリシーの入力内容を確認してください。';
  if (validationStatus === 'permission_denied') {
    return '既定モデルポリシーの更新権限を確認してください。';
  }
  if (validationStatus === 'unavailable') {
    return 'ポリシーサービスを一時的に確認できません。';
  }
  return mode === 'create'
    ? '初期の既定ポリシーにはactive状態を使用します。'
    : 'active状態のポリシーだけをAgentの既定値にできます。';
}

/**
 * Model policy field 名を React Hook Form path map に変換します。
 *
 * @typeParam TValues - 親 form の値型です。
 * @param prefix - nested form で使う object prefix です。空文字の場合は flat path を返します。
 * @returns `ModelPolicyFields` に渡せる field name map です。
 */
export function buildModelPolicyFieldNames<TValues extends FieldValues>(
  prefix: '' | 'modelPolicy'
): ModelPolicyFieldNameMap<TValues> {
  const withPrefix = (fieldName: ModelPolicyFieldName): Path<TValues> =>
    (prefix === '' ? fieldName : `${prefix}.${fieldName}`) as Path<TValues>;
  return {
    policyRef: withPrefix('policyRef'),
    provider: withPrefix('provider'),
    model: withPrefix('model'),
    temperature: withPrefix('temperature'),
    topP: withPrefix('topP'),
    maxOutputTokens: withPrefix('maxOutputTokens'),
  };
}
