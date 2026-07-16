'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type Dispatch, type SetStateAction, type SyntheticEvent } from 'react';
import { useForm, useFormState, type FieldErrors, type UseFormReturn } from 'react-hook-form';

import { RegistrationActions } from './agent-registration-actions';
import {
  applyServerFieldErrors,
  createPolicyValidationFailureResult,
  focusFirstInvalidField,
  getFormFieldError,
  getRegistrationFieldLabel,
} from './agent-registration-form-helpers';
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
import { ValidationSummary } from './validation-summary';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';
import type { BrowserSafeModelPolicyWarning } from './schemas/model-policy';

export { validateRegistrationValues } from './schemas/agent-registration';
export type { RegistrationSubmitResult, RegistrationValues } from './schemas/agent-registration';

type RegistrationOperationDisplayData = BrowserSafeOperationDisplayData & {
  readonly agentId?: string;
  readonly displayName?: string;
  readonly fieldErrors: Partial<Record<RegistrationFieldName, string>>;
  readonly reconciliationRequired?: boolean;
  readonly registrationOutcome?: 'active' | 'reconciliation_required' | 're_registration_ready';
  readonly warnings?: readonly BrowserSafeModelPolicyWarning[];
};
type RegistrationOperationResult = BrowserSafeAgentRpcResult<RegistrationOperationDisplayData>;

/**
 * `AgentRegistrationForm` が受け取る公開 props です。
 *
 * @remarks
 * 初期値は Client D1 から Server Component 経由で渡された公開 metadata だけ、callback は Server Action wrapper だけを受け取ります。
 * credential secret、private JWK、JWT、SDK/Connect client、attempt idempotency key は props に含めません。
 * `onSubmit` の safe failure では入力を保持し、`onReconcileRegistration` がある場合は response-loss 時に唯一の確認操作として使います。
 *
 * @example
 * ```tsx
 * <AgentRegistrationForm
 *   onSubmit={submitManagedAgentRegistration}
 *   onValidateModelPolicy={validateManagedAgentRegistrationModelPolicy}
 *   onReconcileRegistration={reconcileManagedAgentRegistration}
 * />
 * ```
 */
export interface RegistrationFormProps {
  /** edit route が渡す Client-owned managed Agent の公開 identity。未指定時は create flow を表示する。 */
  readonly initialAgent?: {
    readonly agentId: string;
    readonly agentRpcOrigin: string;
    readonly displayName: string;
    readonly displayOrder: number;
  };
  /** edit route が渡す credential reference の安全な表示 metadata。reference 本文や秘密値は含めない。 */
  readonly initialCredential?: {
    readonly keyId: string;
    readonly maskedHint: string;
    readonly status: string;
  };
  /** create/edit を server-only D1/Agent RPC flow へ委譲し、四属性 Browser-safe result を返す callback。 */
  readonly onSubmit: (values: RegistrationValues) => Promise<RegistrationSubmitResult>;
  /** 保存前に draft を server-only Agent RPC で検証し、field association と warning だけを返す callback。 */
  readonly onValidateModelPolicy: (
    values: RegistrationValues
  ) => Promise<RegistrationPolicyValidationResult>;
  /** response-loss 等の registration reconciliation を同じ server-only attempt context で確認する callback。 */
  readonly onReconcileRegistration?: (agentId: string) => Promise<RegistrationSubmitResult>;
}

/**
 * 管理対象 Agent の新規登録・編集を行うアクセシブルなフォームです。
 *
 * @param props - 初期の公開 metadata と Browser-safe Server Action wrapper を含む props です。
 * @returns 登録入力、フィールド検証、処理中状態、four-field 操作結果、状態確認 action を備えたフォームを返します。
 * @throws component 自身は例外を送出せず、Server Action callback の契約外例外も固定安全文言へ丸めて入力を保持します。
 * @remarks
 * credential フィールドは参照値と公開 metadata だけを受け取り、平文 secret は保存・再表示しません。
 * shadcn `Form`、`react-hook-form`、`zod`、Server Action により、UI仕様 §6 のフォーカスと結果表示を実装します。
 * `initialAgent`/`initialCredential` は edit 初期表示、`onSubmit` は通常の登録、`onValidateModelPolicy` は保存前検証、
 * `onReconcileRegistration` は response-loss 時の唯一の状態確認に対応します。成功では ResultRegion が heading へ focus を移し、
 * safe failure では draft を保持して correlation ID と次の安全な操作だけを表示します。
 */
export function AgentRegistrationForm({
  initialAgent,
  initialCredential,
  onSubmit,
  onValidateModelPolicy,
  onReconcileRegistration,
}: RegistrationFormProps) {
  const router = useRouter();
  const isEdit = initialAgent !== undefined;
  const [registrationPending, setRegistrationPending] = useState(false);
  const [policyValidationPending, setPolicyValidationPending] = useState(false);
  const [reconciliationPending, setReconciliationPending] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [operationResult, setOperationResult] = useState<RegistrationSubmitResult | undefined>();
  const [policyValidationResult, setPolicyValidationResult] = useState<
    RegistrationPolicyValidationResult | undefined
  >();
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
  const {
    handleInvalidSubmit,
    handleReconcileRegistration,
    handleValidatePolicy,
    handleValidSubmit,
  } = useRegistrationFormActions({
    form,
    onReconcileRegistration,
    onSubmit,
    onValidateModelPolicy,
    operationResult,
    policyValidationPending,
    reconciliationPending,
    registrationPending,
    setFormError,
    setOperationResult,
    setPolicyValidationPending,
    setPolicyValidationResult,
    setPolicyValidationStatus,
    setPolicyWarnings,
    setReconciliationPending,
    setRegistrationPending,
  });
  return (
    <ControlRoomFrame
      title={isEdit ? 'Agentレジストリ › 編集' : 'Agentレジストリ › 新規登録'}
      signalLabel="登録"
    >
      <RegistrationFormContent
        form={form}
        isEdit={isEdit}
        pending={registrationPending || policyValidationPending || reconciliationPending}
        registrationPending={registrationPending}
        policyValidationPending={policyValidationPending}
        reconciliationPending={reconciliationPending}
        formError={formError}
        operationResult={operationResult}
        policyValidationResult={policyValidationResult}
        policyValidationStatus={policyValidationStatus}
        policyWarnings={policyWarnings}
        onValidatePolicy={() => {
          void handleValidatePolicy();
        }}
        onReconcileRegistration={() => {
          void handleReconcileRegistration();
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
interface RegistrationFormActionControllerProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly onSubmit: RegistrationFormProps['onSubmit'];
  readonly onValidateModelPolicy: RegistrationFormProps['onValidateModelPolicy'];
  readonly onReconcileRegistration: RegistrationFormProps['onReconcileRegistration'];
  readonly operationResult: RegistrationSubmitResult | undefined;
  readonly registrationPending: boolean;
  readonly policyValidationPending: boolean;
  readonly reconciliationPending: boolean;
  readonly setFormError: Dispatch<SetStateAction<string | undefined>>;
  readonly setOperationResult: Dispatch<SetStateAction<RegistrationSubmitResult | undefined>>;
  readonly setPolicyValidationResult: Dispatch<
    SetStateAction<RegistrationPolicyValidationResult | undefined>
  >;
  readonly setPolicyValidationPending: Dispatch<SetStateAction<boolean>>;
  readonly setPolicyValidationStatus: Dispatch<SetStateAction<ModelPolicyValidationStatus>>;
  readonly setPolicyWarnings: Dispatch<SetStateAction<readonly BrowserSafeModelPolicyWarning[]>>;
  readonly setReconciliationPending: Dispatch<SetStateAction<boolean>>;
  readonly setRegistrationPending: Dispatch<SetStateAction<boolean>>;
}
function useRegistrationFormActions({
  form,
  onSubmit,
  onValidateModelPolicy,
  onReconcileRegistration,
  operationResult,
  registrationPending,
  policyValidationPending,
  reconciliationPending,
  setFormError,
  setOperationResult,
  setPolicyValidationResult,
  setPolicyValidationPending,
  setPolicyValidationStatus,
  setPolicyWarnings,
  setReconciliationPending,
  setRegistrationPending,
}: RegistrationFormActionControllerProps) {
  const handleValidSubmit = async (values: RegistrationValues): Promise<void> => {
    if (registrationPending || policyValidationPending || reconciliationPending) return; // submit event と Enter key の二重起動を拒否する。
    // 新規 submit は stale result を消し、Server Action の四属性 result だけを通知内容として採用します。
    form.clearErrors();
    setFormError(undefined);
    setOperationResult(undefined);
    setPolicyValidationResult(undefined);
    setRegistrationPending(true);
    try {
      const result = await onSubmit(values);
      setOperationResult(result);
      if (result.safeStatus === 'succeeded') return;
      applyServerFieldErrors(form, result.displayData.fieldErrors);
    } catch {
      setFormError(
        '入力内容はこの画面に保持されています。時間をおいて「もう一度登録」を実行してください。'
      );
    } finally {
      setRegistrationPending(false);
    }
  };
  const handleInvalidSubmit = (fieldErrors: FieldErrors<RegistrationValues>) => {
    setOperationResult(undefined);
    setPolicyValidationResult(undefined);
    setFormError('強調表示されたフィールドを確認すると登録を続行できます。');
    focusFirstInvalidField(form, fieldErrors);
  };
  const handleValidatePolicy = async (): Promise<void> => {
    if (registrationPending || policyValidationPending || reconciliationPending) return;
    const valid = await form.trigger(REGISTRATION_FIELD_ORDER);
    if (!valid) {
      setOperationResult(undefined);
      setPolicyValidationResult(undefined);
      setPolicyValidationStatus('invalid');
      setFormError('強調表示されたフィールドを確認するとポリシー検証を続行できます。');
      focusFirstInvalidField(form, form.formState.errors);
      return;
    }
    setOperationResult(undefined);
    setPolicyValidationResult(undefined);
    setPolicyValidationPending(true);
    setPolicyValidationStatus('validating');
    setFormError(undefined);
    try {
      const result = await onValidateModelPolicy(form.getValues());
      setPolicyValidationResult(result);
      setPolicyWarnings(result.displayData.warnings);
      if (result.safeStatus === 'succeeded') {
        setPolicyValidationStatus(result.displayData.warnings.length > 0 ? 'warning' : 'valid');
        return;
      }
      setPolicyValidationStatus('invalid');
      setFormError(result.displayData.message);
      applyServerFieldErrors(form, result.displayData.fieldErrors);
    } catch {
      setPolicyValidationStatus('unavailable');
      setPolicyValidationResult(createPolicyValidationFailureResult());
    } finally {
      setPolicyValidationPending(false);
    }
  };
  const handleReconcileRegistration = async (): Promise<void> => {
    const agentId = operationResult?.displayData.agentId;
    if (
      onReconcileRegistration === undefined ||
      agentId === undefined ||
      registrationPending ||
      policyValidationPending ||
      reconciliationPending
    ) {
      return;
    }
    setReconciliationPending(true);
    setFormError(undefined);
    try {
      const result = await onReconcileRegistration(agentId);
      setOperationResult(result);
      if (result.safeStatus === 'failed') setFormError(result.displayData.message);
    } catch {
      setFormError(
        '登録状態を確認できませんでした。時間をおいて「登録状態を確認」を実行してください。'
      );
    } finally {
      setReconciliationPending(false);
    }
  };
  return {
    handleInvalidSubmit,
    handleReconcileRegistration,
    handleValidatePolicy,
    handleValidSubmit,
  };
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
interface RegistrationFormContentProps {
  readonly form: UseFormReturn<RegistrationValues>;
  readonly isEdit: boolean;
  readonly pending: boolean;
  readonly registrationPending: boolean;
  readonly policyValidationPending: boolean;
  readonly reconciliationPending: boolean;
  readonly formError: string | undefined;
  readonly operationResult: RegistrationSubmitResult | undefined;
  readonly policyValidationResult: RegistrationPolicyValidationResult | undefined;
  readonly policyValidationStatus: ModelPolicyValidationStatus;
  readonly policyWarnings: readonly BrowserSafeModelPolicyWarning[];
  readonly onValidatePolicy: () => void;
  readonly onReconcileRegistration: () => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}

function RegistrationFormContent({
  form,
  isEdit,
  pending,
  registrationPending,
  policyValidationPending,
  reconciliationPending,
  formError,
  operationResult,
  policyValidationResult,
  policyValidationStatus,
  policyWarnings,
  onValidatePolicy,
  onReconcileRegistration,
  onSubmit,
  onCancel,
}: RegistrationFormContentProps) {
  // ValidationSummary は RHF state を直接購読し、フィールド直下の error と同じ render で anchor 一覧を更新します。
  const { errors: fieldErrors } = useFormState({ control: form.control });
  const reconciliationRequired = operationResult?.displayData.reconciliationRequired === true;
  const reRegistrationReady =
    operationResult?.displayData.registrationOutcome === 're_registration_ready';
  const activeRegistration =
    operationResult?.safeStatus === 'succeeded' &&
    operationResult.displayData.registrationOutcome === 'active';
  const registrationLocked = pending || reconciliationRequired || activeRegistration;
  const displayedOperationResult: RegistrationOperationResult | undefined =
    operationResult ?? policyValidationResult;

  return (
    <>
      <h2>サーバー側参照情報でAgentを登録します</h2>
      <p className="text-sm text-muted-foreground">
        Agent ID、許可済みのHTTPS Agent RPC
        origin、表示名を入力します。credentialフィールドはサーバー側検索参照と公開メタデータを受け付けます。
      </p>

      <Form {...form}>
        <form onSubmit={onSubmit} noValidate aria-busy={pending}>
          <OperationResultRegion<RegistrationOperationDisplayData>
            result={displayedOperationResult}
            pending={registrationPending || policyValidationPending || reconciliationPending}
            pendingTitle={
              reconciliationPending
                ? '登録状態を確認しています'
                : policyValidationPending
                  ? 'ポリシーを検証しています'
                  : 'Agentを登録しています'
            }
            pendingMessage={
              reconciliationPending
                ? 'サーバー側のAgent profile、設定、既定モデルポリシーを照合しています…'
                : policyValidationPending
                  ? '入力したポリシーをサーバー側Agentで検証しています…'
                  : '登録情報を確認し、Agentを初期化しています…'
            }
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
            {reconciliationRequired ? (
              <Button
                type="button"
                className="mt-4 min-h-11"
                aria-disabled={reconciliationPending}
                aria-busy={reconciliationPending}
                onClick={onReconcileRegistration}
              >
                登録状態を確認
              </Button>
            ) : null}
          </OperationResultRegion>
          {displayedOperationResult?.safeStatus === 'failed' ? null : (
            <ValidationSummary
              formError={formError}
              items={collectFieldErrorSummaryItems(fieldErrors)}
              onFocusField={(fieldName) => {
                form.setFocus(fieldName);
              }}
            />
          )}
          <RegistrationTextField
            form={form}
            name="agentId"
            label="Agent ID"
            helper="Durable Object名。小文字のkebab-caseで入力してください。"
            disabled={isEdit || registrationLocked}
            required
          />
          <RegistrationTextField
            form={form}
            name="agentRpcOrigin"
            label="Agent RPC origin"
            helper={
              '運用ポリシーで許可された正規HTTPS originを入力してください（例: https://agent.example.com）。scheme、host、任意のportで構成します。'
            }
            disabled={registrationLocked}
            required
          />
          <RegistrationTextField
            form={form}
            name="displayName"
            label="表示名"
            helper="Agentレジストリと概要に表示します。"
            disabled={registrationLocked}
            required
          />
          <RegistrationTextField
            form={form}
            name="displayOrder"
            label="表示順（任意）"
            helper="同じpin groupでは小さい番号を先に表示します。"
            disabled={registrationLocked}
            inputMode="numeric"
          />
          <ModelPolicyFields
            form={form}
            names={buildModelPolicyFieldNames<RegistrationValues>('modelPolicy')}
            mode="create"
            disabled={registrationLocked}
            validationStatus={policyValidationStatus}
            warnings={policyWarnings}
            onValidate={activeRegistration ? undefined : onValidatePolicy}
          />
          <CredentialReferenceSection
            form={form}
            pending={registrationLocked}
            readOnly={activeRegistration}
          />
          {activeRegistration ? null : (
            <RegistrationActions
              isEdit={isEdit}
              reRegistrationReady={reRegistrationReady}
              disabled={pending || reconciliationRequired}
              pending={registrationPending}
              onCancel={onCancel}
            />
          )}
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
  readonly readOnly: boolean;
}

function CredentialReferenceSection({ form, pending, readOnly }: CredentialReferenceSectionProps) {
  const content = (
    <>
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
    </>
  );
  if (readOnly) {
    // active 確定後は disclosure summary を Tab 順から除外し、照合済み metadata だけを読む領域へ変えます。
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground">credential参照</p>
        {content}
      </div>
    );
  }
  return (
    <details open>
      <summary className="text-xs font-medium text-muted-foreground">credential参照</summary>
      {content}
    </details>
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
