'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';
import { useForm, useFormState, type FieldErrors, type UseFormReturn } from 'react-hook-form';

import { RegistrationActions } from './agent-registration-actions';
import { ControlRoomFrame } from './control-room-frame';
import {
  buildModelPolicyFieldNames,
  ModelPolicyFields,
  type ModelPolicyValidationStatus,
} from './model-policy-fields';
import { OperationResultRegion } from './operation-result-region';
import {
  buildRegistrationModelPolicyDefaults,
  REGISTRATION_FIELD_ORDER,
  registrationSchema,
  type RegistrationFieldName,
  type RegistrationPolicyValidationResult,
  type RegistrationSubmitResult,
  type RegistrationValues,
} from './schemas/agent-registration';
import { Button } from './ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField as RhfFormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

import type { BrowserSafeModelPolicyWarning } from './schemas/model-policy';

export { validateRegistrationValues } from './schemas/agent-registration';
export type { RegistrationSubmitResult, RegistrationValues } from './schemas/agent-registration';

interface RegistrationFormProps {
  readonly initialAgent?: {
    readonly agentId: string;
    readonly agentRpcOrigin: string;
    readonly displayName: string;
    readonly displayOrder: number;
  };
  readonly initialCredential?: {
    readonly keyId: string;
    readonly maskedHint: string;
    readonly status: string;
  };
  readonly onSubmit: (values: RegistrationValues) => Promise<RegistrationSubmitResult>;
  readonly onValidateModelPolicy: (
    values: RegistrationValues
  ) => Promise<RegistrationPolicyValidationResult>;
}

/**
 * 管理対象 Agent の新規登録・編集を行うアクセシブルなフォームです。
 *
 * @param props - 初期の公開 metadata と Browser-safe Server Action wrapper を含む props です。
 * @returns 登録入力、フィールド検証、処理中状態、four-field 操作結果を備えたフォームを返します。
 * @remarks
 * credential フィールドは参照値と公開 metadata だけを受け取り、平文 secret は保存・再表示しません。
 * shadcn `Form`、`react-hook-form`、`zod`、Server Action により、UI仕様 §6 のフォーカスと結果表示を実装します。
 */
export function AgentRegistrationForm({
  initialAgent,
  initialCredential,
  onSubmit,
  onValidateModelPolicy,
}: RegistrationFormProps) {
  const router = useRouter();
  const isEdit = initialAgent !== undefined;
  const [registrationPending, setRegistrationPending] = useState(false);
  const [policyValidationPending, setPolicyValidationPending] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [operationResult, setOperationResult] = useState<RegistrationSubmitResult | undefined>();
  const [policyValidationStatus, setPolicyValidationStatus] =
    useState<ModelPolicyValidationStatus>('idle');
  const [policyWarnings, setPolicyWarnings] = useState<readonly BrowserSafeModelPolicyWarning[]>(
    []
  );
  const form = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: createInitialValues(initialAgent, initialCredential),
    mode: 'onChange',
    shouldFocusError: true,
  });

  const handleValidSubmit = async (values: RegistrationValues) => {
    form.clearErrors();
    setFormError(undefined);
    setOperationResult(undefined);
    setRegistrationPending(true);
    try {
      const result = await onSubmit(values);
      setOperationResult(result);
      if (result.safeStatus === 'succeeded') {
        return;
      }
      setFormError(result.displayData.message);
      applyServerFieldErrors(form, result.displayData.fieldErrors);
    } catch {
      // Server Action の安全な result 契約を守れない例外も raw detail を表示せず、入力を保持して再試行を案内します。
      setFormError(
        '入力内容はこの画面に保持されています。時間をおいて「もう一度登録」を実行してください。'
      );
    } finally {
      setRegistrationPending(false);
    }
  };

  const handleInvalidSubmit = (fieldErrors: FieldErrors<RegistrationValues>) => {
    setFormError('強調表示されたフィールドを確認すると登録を続行できます。');
    focusFirstInvalidField(form, fieldErrors);
  };

  const handleValidatePolicy = async (): Promise<void> => {
    // policy validation でも Agent ID、RPC origin、credential reference が必要なため、Server Action 前に同じ form validation を走らせる。
    const valid = await form.trigger(REGISTRATION_FIELD_ORDER);
    if (!valid) {
      setPolicyValidationStatus('invalid');
      setFormError('強調表示されたフィールドを確認するとポリシー検証を続行できます。');
      focusFirstInvalidField(form, form.formState.errors);
      return;
    }
    setOperationResult(undefined);
    setPolicyValidationPending(true);
    setPolicyValidationStatus('validating');
    setFormError(undefined);
    try {
      const result = await onValidateModelPolicy(form.getValues());
      if (result.safeStatus === 'succeeded') {
        setPolicyWarnings(result.displayData.warnings);
        setPolicyValidationStatus(result.displayData.warnings.length > 0 ? 'warning' : 'valid');
        return;
      }
      setPolicyWarnings(result.displayData.warnings);
      setPolicyValidationStatus('invalid');
      setFormError(result.displayData.message);
      applyServerFieldErrors(form, result.displayData.fieldErrors);
    } catch {
      setPolicyValidationStatus('unavailable');
      setFormError('ポリシーの検証結果を確認できません。時間をおいてもう一度実行してください。');
    } finally {
      setPolicyValidationPending(false);
    }
  };

  return (
    <ControlRoomFrame
      title={isEdit ? 'Agentレジストリ › 編集' : 'Agentレジストリ › 新規登録'}
      signalLabel="登録"
    >
      <RegistrationFormContent
        form={form}
        isEdit={isEdit}
        pending={registrationPending || policyValidationPending}
        registrationPending={registrationPending}
        formError={formError}
        operationResult={operationResult}
        policyValidationStatus={policyValidationStatus}
        policyWarnings={policyWarnings}
        onValidatePolicy={() => {
          void handleValidatePolicy();
        }}
        onSubmit={(event) => {
          void form.handleSubmit(handleValidSubmit, handleInvalidSubmit)(event);
        }}
        onCancel={() => {
          router.push('/agents');
        }}
      />
    </ControlRoomFrame>
  );
}

function createInitialValues(
  initialAgent?: RegistrationFormProps['initialAgent'],
  initialCredential?: RegistrationFormProps['initialCredential']
): RegistrationValues {
  return {
    agentId: initialAgent?.agentId ?? '',
    agentRpcOrigin: initialAgent?.agentRpcOrigin ?? '',
    displayName: initialAgent?.displayName ?? '',
    displayOrder: initialAgent !== undefined ? String(initialAgent.displayOrder) : '0',
    modelPolicy: buildRegistrationModelPolicyDefaults(),
    referenceValue: '',
    keyId: initialCredential?.keyId ?? '',
    publicFingerprint: '',
    maskedHint: initialCredential?.maskedHint ?? '',
    status: initialCredential?.status ?? 'active',
  };
}

function applyServerFieldErrors(
  form: UseFormReturn<RegistrationValues>,
  fieldErrors: Partial<Record<RegistrationFieldName, string>>
): void {
  let firstInvalidField: RegistrationFieldName | undefined;
  for (const fieldName of REGISTRATION_FIELD_ORDER) {
    const message = getServerFieldError(fieldErrors, fieldName);
    if (message !== undefined) {
      form.setError(fieldName, { type: 'server', message });
      firstInvalidField ??= fieldName;
    }
  }
  if (firstInvalidField !== undefined) {
    form.setFocus(firstInvalidField);
  }
}

function focusFirstInvalidField(
  form: UseFormReturn<RegistrationValues>,
  fieldErrors: FieldErrors<RegistrationValues>
): void {
  for (const fieldName of REGISTRATION_FIELD_ORDER) {
    if (getFormFieldError(fieldErrors, fieldName) !== undefined) {
      form.setFocus(fieldName);
      return;
    }
  }
}

interface RegistrationFormContentProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly isEdit: boolean;
  readonly pending: boolean;
  readonly registrationPending: boolean;
  readonly formError: string | undefined;
  readonly operationResult: RegistrationSubmitResult | undefined;
  readonly policyValidationStatus: ModelPolicyValidationStatus;
  readonly policyWarnings: readonly BrowserSafeModelPolicyWarning[];
  readonly onValidatePolicy: () => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}

function RegistrationFormContent({
  form,
  isEdit,
  pending,
  registrationPending,
  formError,
  operationResult,
  policyValidationStatus,
  policyWarnings,
  onValidatePolicy,
  onSubmit,
  onCancel,
}: RegistrationFormContentProps) {
  // ValidationSummary は RHF state を直接購読し、フィールド直下の error と同じ render で anchor 一覧を更新します。
  const { errors: fieldErrors } = useFormState({ control: form.control });

  return (
    <>
      <h2>サーバー側参照情報でAgentを登録します</h2>
      <p className="text-sm text-muted-foreground">
        Agent ID、許可済みのHTTPS Agent RPC
        origin、表示名を入力します。credentialフィールドはサーバー側検索参照と公開メタデータを受け付けます。
      </p>

      <Form {...form}>
        <form onSubmit={onSubmit} noValidate aria-busy={pending}>
          <OperationResultRegion
            result={operationResult}
            pending={registrationPending}
            pendingTitle="Agentを登録しています"
            pendingMessage="登録情報を確認し、Agentを初期化しています…"
          >
            {operationResult?.safeStatus === 'succeeded' &&
            operationResult.displayData.agentId !== undefined ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild type="button" className="min-h-11">
                  <Link href={`/agents/${operationResult.displayData.agentId}`}>
                    Agentの概要を開く
                  </Link>
                </Button>
                <Button asChild type="button" variant="outline" className="min-h-11">
                  <Link href="/agents">Agent一覧に戻る</Link>
                </Button>
              </div>
            ) : null}
          </OperationResultRegion>
          <ValidationSummary form={form} formError={formError} fieldErrors={fieldErrors} />
          <RegistrationTextField
            form={form}
            name="agentId"
            label="Agent ID"
            helper="Durable Object名。小文字のkebab-caseで入力してください。"
            disabled={isEdit || pending}
            required
          />
          <RegistrationTextField
            form={form}
            name="agentRpcOrigin"
            label="Agent RPC origin"
            helper="運用ポリシーで許可された正規HTTPS originを入力してください（例: https://agent.example.com）。scheme、host、任意のportで構成します。"
            disabled={pending}
            required
          />
          <RegistrationTextField
            form={form}
            name="displayName"
            label="表示名"
            helper="Agentレジストリと概要に表示します。"
            disabled={pending}
            required
          />
          <RegistrationTextField
            form={form}
            name="displayOrder"
            label="表示順（任意）"
            helper="同じpin groupでは小さい番号を先に表示します。"
            disabled={pending}
            inputMode="numeric"
          />
          <ModelPolicyFields
            form={form}
            names={buildModelPolicyFieldNames<RegistrationValues>('modelPolicy')}
            mode="create"
            disabled={pending}
            validationStatus={policyValidationStatus}
            warnings={policyWarnings}
            onValidate={onValidatePolicy}
          />
          <CredentialReferenceSection form={form} pending={pending} />
          <RegistrationActions
            isEdit={isEdit}
            disabled={pending}
            pending={registrationPending}
            onCancel={onCancel}
          />
        </form>
      </Form>
    </>
  );
}

interface RegistrationTextFieldProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly name: RegistrationFieldName;
  readonly label: string;
  readonly helper?: string;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly inputMode?: 'numeric';
}

function RegistrationTextField({
  form,
  name,
  label,
  helper,
  disabled,
  required,
  autoComplete,
  inputMode,
}: RegistrationTextFieldProps) {
  return (
    <RhfFormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {/* field name を label/input の共有 ID として明示し、支援技術とラベル起点の操作が同じ入力を解決できるようにします。 */}
          <FormLabel htmlFor={name}>{label}</FormLabel>
          {helper !== undefined ? <FormDescription>{helper}</FormDescription> : null}
          <FormControl>
            <Input
              {...field}
              className="h-11"
              id={name}
              autoComplete={autoComplete}
              disabled={disabled}
              inputMode={inputMode}
              required={required}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface CredentialReferenceSectionProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly pending: boolean;
}

function CredentialReferenceSection({ form, pending }: CredentialReferenceSectionProps) {
  return (
    <details open>
      <summary className="text-xs font-medium text-muted-foreground">credential参照</summary>
      <p className="text-xs text-muted-foreground">
        Clientは参照値、キーID、公開フィンガープリント、マスク済みヒント、状態を管理します。秘密情報の解決処理とcredential情報はサーバー側が所有します。
      </p>
      <RegistrationTextField
        form={form}
        name="referenceValue"
        label="credential参照"
        helper="サーバー側secret resolverが使用するopaque参照を入力します。"
        disabled={pending}
        autoComplete="off"
        required
      />
      <RegistrationTextField
        form={form}
        name="keyId"
        label="キーID"
        disabled={pending}
        autoComplete="off"
        required
      />
      <RegistrationTextField
        form={form}
        name="publicFingerprint"
        label="公開フィンガープリント"
        helper="Agent公開鍵のフィンガープリントを入力します。"
        disabled={pending}
        autoComplete="off"
        required
      />
      <RegistrationTextField
        form={form}
        name="maskedHint"
        label="マスク済みヒント"
        helper="例: ed25519:ab…12。masked identifierを入力します。"
        disabled={pending}
        autoComplete="off"
        required
      />
      <RhfFormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem>
            {/* ValidationSummary の semantic anchor とラベル操作が同じ Select trigger を解決するよう固定 ID を使います。 */}
            <FormLabel htmlFor="status">状態</FormLabel>
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={pending}
              name={field.name}
            >
              <FormControl>
                <SelectTrigger ref={field.ref} id="status" className="h-11" aria-label="状態">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="rotating">rotating</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </details>
  );
}

interface ValidationSummaryProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly formError: string | undefined;
  readonly fieldErrors: FieldErrors<RegistrationValues>;
}

function ValidationSummary({ form, formError, fieldErrors }: ValidationSummaryProps) {
  const summaryItems = collectFieldErrorSummaryItems(fieldErrors);
  if (formError === undefined && summaryItems.length === 0) {
    return null;
  }
  return (
    <div
      className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground"
      role="alert"
    >
      <h3 className="font-medium">登録内容を確認してください</h3>
      <p className="mt-1">
        {formError ?? '強調表示されたフィールドを確認すると登録を続行できます。'}
      </p>
      {summaryItems.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 font-mono text-xs">
          {summaryItems.map((item) => (
            <li key={item.fieldName}>
              <Button asChild variant="link" className="h-auto p-0 text-left">
                <a
                  href={`#${item.fieldName}`}
                  onClick={() => {
                    // native anchor の URL/scroll semantics を保ちつつ、click/Enter 後に RHF の field focus を明示します。
                    form.setFocus(item.fieldName);
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

function collectFieldErrorSummaryItems(fieldErrors: FieldErrors<RegistrationValues>): {
  readonly fieldName: RegistrationFieldName;
  readonly label: string;
  readonly message: string;
}[] {
  const items: {
    readonly fieldName: RegistrationFieldName;
    readonly label: string;
    readonly message: string;
  }[] = [];
  for (const fieldName of REGISTRATION_FIELD_ORDER) {
    const message = getFormFieldError(fieldErrors, fieldName)?.message;
    if (typeof message === 'string' && message !== '') {
      items.push({ fieldName, label: getRegistrationFieldLabel(fieldName), message });
    }
  }
  return items;
}

function getServerFieldError(
  fieldValues: Partial<Record<RegistrationFieldName, string>>,
  fieldName: RegistrationFieldName
): string | undefined {
  if (fieldName === 'agentId') return fieldValues.agentId;
  if (fieldName === 'agentRpcOrigin') return fieldValues.agentRpcOrigin;
  if (fieldName === 'displayName') return fieldValues.displayName;
  if (fieldName === 'displayOrder') return fieldValues.displayOrder;
  if (fieldName === 'modelPolicy.policyRef') return fieldValues['modelPolicy.policyRef'];
  if (fieldName === 'modelPolicy.provider') return fieldValues['modelPolicy.provider'];
  if (fieldName === 'modelPolicy.model') return fieldValues['modelPolicy.model'];
  if (fieldName === 'modelPolicy.temperature') return fieldValues['modelPolicy.temperature'];
  if (fieldName === 'modelPolicy.topP') return fieldValues['modelPolicy.topP'];
  if (fieldName === 'modelPolicy.maxOutputTokens') {
    return fieldValues['modelPolicy.maxOutputTokens'];
  }
  if (fieldName === 'referenceValue') return fieldValues.referenceValue;
  if (fieldName === 'keyId') return fieldValues.keyId;
  if (fieldName === 'publicFingerprint') return fieldValues.publicFingerprint;
  if (fieldName === 'maskedHint') return fieldValues.maskedHint;
  return fieldValues.status;
}

function getRegistrationFieldLabel(fieldName: RegistrationFieldName): string {
  if (fieldName === 'agentId') return 'Agent ID';
  if (fieldName === 'agentRpcOrigin') return 'Agent RPC origin';
  if (fieldName === 'displayName') return '表示名';
  if (fieldName === 'displayOrder') return '表示順（任意）';
  if (fieldName === 'modelPolicy.policyRef') return 'ポリシー参照';
  if (fieldName === 'modelPolicy.provider') return 'プロバイダー';
  if (fieldName === 'modelPolicy.model') return 'モデルID';
  if (fieldName === 'modelPolicy.temperature') return '温度';
  if (fieldName === 'modelPolicy.topP') return 'Top P';
  if (fieldName === 'modelPolicy.maxOutputTokens') return '最大出力トークン数';
  if (fieldName === 'referenceValue') return 'credential参照';
  if (fieldName === 'keyId') return 'キーID';
  if (fieldName === 'publicFingerprint') return '公開フィンガープリント';
  if (fieldName === 'maskedHint') return 'マスク済みヒント';
  return '状態';
}

function getFormFieldError(
  fieldErrors: FieldErrors<RegistrationValues>,
  fieldName: RegistrationFieldName
) {
  if (fieldName === 'agentId') return fieldErrors.agentId;
  if (fieldName === 'agentRpcOrigin') return fieldErrors.agentRpcOrigin;
  if (fieldName === 'displayName') return fieldErrors.displayName;
  if (fieldName === 'displayOrder') return fieldErrors.displayOrder;
  if (fieldName === 'modelPolicy.policyRef') return fieldErrors.modelPolicy?.policyRef;
  if (fieldName === 'modelPolicy.provider') return fieldErrors.modelPolicy?.provider;
  if (fieldName === 'modelPolicy.model') return fieldErrors.modelPolicy?.model;
  if (fieldName === 'modelPolicy.temperature') return fieldErrors.modelPolicy?.temperature;
  if (fieldName === 'modelPolicy.topP') return fieldErrors.modelPolicy?.topP;
  if (fieldName === 'modelPolicy.maxOutputTokens') return fieldErrors.modelPolicy?.maxOutputTokens;
  if (fieldName === 'referenceValue') return fieldErrors.referenceValue;
  if (fieldName === 'keyId') return fieldErrors.keyId;
  if (fieldName === 'publicFingerprint') return fieldErrors.publicFingerprint;
  if (fieldName === 'maskedHint') return fieldErrors.maskedHint;
  return fieldErrors.status;
}
