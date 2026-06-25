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
import { Select } from './ui/select';

import type { BrowserSafeModelPolicyWarning, ModelPolicyFieldName } from './schemas/model-policy';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/** Model policy editor の表示 mode です。 */
export type ModelPolicyMode = 'create' | 'settings';

/** Model policy validation UI が表示する状態です。 */
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
      aria-labelledby="model-policy-heading"
      aria-describedby="model-policy-helper model-policy-boundary-helper"
      className="readout"
    >
      <div className="topline">
        <span className="eyebrow">Model execution</span>
        <span className="state-success">
          {mode === 'create' ? 'active on create' : 'server-side only'}
        </span>
      </div>
      <legend id="model-policy-heading">Default model policy</legend>
      <p id="model-policy-helper" className="form-helper">
        Seed the Agent-owned policy that future Runs resolve by reference. The browser sees only
        ref, provider, model, parameters, status, warnings, and digest.
      </p>
      <p id="model-policy-boundary-helper" className="form-helper">
        Validation and save happen through server-side Agent RPC. No Provider credential or Agent
        RPC credential is sent to the browser.
      </p>
      <p aria-live="polite" className="form-helper">
        {statusCopy}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <PolicyTextField
          form={form}
          name={names.policyRef}
          label="Policy ref"
          helper="Agent-owned reference used by AgentConfig.modelPolicyRef. Use lowercase kebab-case."
          disabled={disabled || pending}
          required
        />
        <ProviderField form={form} name={names.provider} disabled={disabled || pending} />
        <PolicyTextField
          form={form}
          name={names.model}
          label="Model ID"
          helper="Workers AI model identifier. The Agent validates support before saving."
          disabled={disabled || pending}
          required
        />
        <PolicyTextField
          form={form}
          name={names.temperature}
          label="Temperature"
          helper="0.00–2.00. Lower is steadier; higher is more exploratory."
          disabled={disabled || pending}
          inputMode="decimal"
          type="number"
          required
        />
        <PolicyTextField
          form={form}
          name={names.topP}
          label="Top P"
          helper="0.01–1.00 nucleus sampling cap."
          disabled={disabled || pending}
          inputMode="decimal"
          type="number"
          required
        />
        <PolicyTextField
          form={form}
          name={names.maxOutputTokens}
          label="Max output tokens"
          helper="1–8192 token response cap for one model call."
          disabled={disabled || pending}
          inputMode="numeric"
          type="number"
          required
        />
      </div>
      <WarningList warnings={warnings} />
      {onValidate !== undefined ? (
        <div className="action-row">
          <Button
            type="button"
            variant="outline"
            onClick={onValidate}
            disabled={validateDisabled}
            aria-disabled={validateDisabled}
          >
            {pending ? 'Validating policy…' : 'Validate policy'}
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
          <FormLabel>{label}</FormLabel>
          <FormDescription>{helper}</FormDescription>
          <FormControl>
            <Input
              {...field}
              autoComplete="off"
              disabled={disabled}
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
          <FormLabel>Provider</FormLabel>
          <FormDescription>
            Only Workers AI is available for this change. Provider credentials stay server-side.
          </FormDescription>
          <FormControl>
            <Select {...field} disabled={disabled} required>
              <option value="workers-ai">workers-ai</option>
            </Select>
          </FormControl>
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
    <div className="readout" role="status" aria-live="polite">
      <strong>Policy validation warnings</strong>
      <ul className="mt-2 list-disc pl-5 font-mono text-xs">
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
  if (validationStatus === 'validating') return 'Validating policy…';
  if (validationStatus === 'valid') return 'Policy draft is valid for Workers AI.';
  if (validationStatus === 'warning' || warningCount > 0) {
    return 'Policy draft is valid with warnings.';
  }
  if (validationStatus === 'invalid') return 'The policy draft is invalid.';
  if (validationStatus === 'permission_denied') {
    return 'You do not have permission to update the default model policy.';
  }
  if (validationStatus === 'unavailable') {
    return 'Agent policy service is temporarily unavailable.';
  }
  return mode === 'create'
    ? 'Initial default policies must be active.'
    : 'Only active policies can be the Agent default.';
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
