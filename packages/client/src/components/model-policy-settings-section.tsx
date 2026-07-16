'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useForm, useFormState, type FieldErrors, type UseFormReturn } from 'react-hook-form';

import { generateIdempotencyKey } from './generate-idempotency-key';
import {
  buildModelPolicyFieldNames,
  ModelPolicyFields,
  type ModelPolicyValidationStatus,
} from './model-policy-fields';
import { ModelPolicySummary } from './model-policy-summary';
import { OperationResultRegion } from './operation-result-region';
import {
  settingsModelPolicySchema,
  type SettingsModelPolicyValues,
} from './schemas/agent-settings';
import {
  buildDefaultModelPolicyDraftValues,
  type BrowserSafeModelPolicyMetadata,
  type BrowserSafeModelPolicyMutationResult,
  type BrowserSafeModelPolicySaveResult,
  type BrowserSafeModelPolicyWarning,
} from './schemas/model-policy';
import { Button } from './ui/button';
import { Form } from './ui/form';
import { ValidationSummary, type ValidationSummaryItem } from './validation-summary';

interface ModelPolicyReconciliationOperation {
  readonly draft: SettingsModelPolicyValues;
  readonly operationKey: string;
}

/**
 * Settings の default model policy section が受け取る props です。
 *
 * @remarks
 * props は Agent ID、safe metadata、Server Action wrapper だけを含みます。Agent RPC client、Connect
 * runtime、credential 解決情報は親 Server Component/Action に閉じ、Browser には渡しません。
 */
export interface ModelPolicySettingsSectionProps {
  readonly agentId: string;
  readonly initialMetadata?: BrowserSafeModelPolicyMetadata;
  readonly pending: boolean;
  readonly onValidatePolicy: (
    draft: SettingsModelPolicyValues
  ) => Promise<BrowserSafeModelPolicyMutationResult>;
  readonly onSavePolicy: (
    idempotencyKey: string,
    draft: SettingsModelPolicyValues
  ) => Promise<BrowserSafeModelPolicySaveResult>;
  /** response-loss 後に同じ operation key と draft を使い、GetConfig 照合だけを行う Server Action wrapper。 */
  readonly onReconcilePolicy: (
    operationKey: string,
    draft: SettingsModelPolicyValues
  ) => Promise<BrowserSafeModelPolicySaveResult>;
}

/**
 * Agent Settings に配置する default model policy summary/editor section です。
 *
 * @param props - Agent ID、初期 safe metadata、pending 状態、Server Action wrapper を含む props です。
 * @returns ModelPolicySummary と ModelPolicyFields を組み合わせた settings section を返します。
 * @remarks
 * Upsert と config update の順序は Server Action 側に委譲します。この component は form validation、
 * warning/error 表示、save button の pending 制御だけを担当し、Browser から direct Agent RPC は行いません。
 */
export function ModelPolicySettingsSection({
  agentId,
  initialMetadata,
  pending,
  onValidatePolicy,
  onSavePolicy,
  onReconcilePolicy,
}: ModelPolicySettingsSectionProps) {
  const [validationStatus, setValidationStatus] = useState<ModelPolicyValidationStatus>('idle');
  const [warnings, setWarnings] = useState<readonly BrowserSafeModelPolicyWarning[]>(
    initialMetadata?.warnings ?? []
  );
  const [formError, setFormError] = useState<string | undefined>();
  const [operationResult, setOperationResult] = useState<
    BrowserSafeModelPolicyMutationResult | undefined
  >();
  const [currentMetadata, setCurrentMetadata] = useState(initialMetadata);
  const [reconciliationError, setReconciliationError] = useState<string | undefined>();
  const [reconciliationOperation, setReconciliationOperation] = useState<
    ModelPolicyReconciliationOperation | undefined
  >();
  const [reconciliationPending, setReconciliationPending] = useState(false);
  const form = useForm<SettingsModelPolicyValues>({
    resolver: zodResolver(settingsModelPolicySchema),
    defaultValues: metadataToDraft(initialMetadata),
    mode: 'onChange',
    shouldFocusError: true,
  });
  useEffect(() => {
    // Server refresh で Agent RPC 由来 metadata が変わったら、未送信 draft を現在の safe metadata へ戻す。
    form.reset(metadataToDraft(initialMetadata));
    setWarnings(initialMetadata?.warnings ?? []);
    setCurrentMetadata(initialMetadata);
    setValidationStatus('idle');
    setFormError(undefined);
    setOperationResult(undefined);
    setReconciliationError(undefined);
    setReconciliationOperation(undefined);
    setReconciliationPending(false);
  }, [form, initialMetadata]);
  const permissionDenied = operationResult?.safeErrorCategory === 'permission_denied';
  const reconciliationRequired = operationResult?.displayData.reconciliationRequired === true;
  const mutationLocked = resolveModelPolicyMutationLock(
    pending,
    reconciliationPending,
    validationStatus,
    permissionDenied,
    reconciliationRequired
  );
  const handleValidate = async (): Promise<void> => {
    if (permissionDenied) {
      setFormError('既定モデルポリシーの更新権限を確認してください。');
      return;
    }
    if (mutationLocked) {
      return;
    }
    const valid = await form.trigger();
    if (!valid) {
      setOperationResult(undefined);
      setValidationStatus('invalid');
      setFormError('強調表示されたフィールドを確認するとポリシー検証を続行できます。');
      focusFirstInvalidModelPolicyField(form, form.formState.errors);
      return;
    }
    setValidationStatus('validating');
    setFormError(undefined);
    const result = await onValidatePolicy(form.getValues());
    setOperationResult(result);
    applyPolicyResult(result, setValidationStatus, setWarnings, setFormError);
  };
  const handleSave = async (): Promise<void> => {
    if (permissionDenied) {
      setFormError('既定モデルポリシーの更新権限を確認してください。');
      return;
    }
    if (mutationLocked) {
      return;
    }
    const valid = await form.trigger();
    if (!valid) {
      setOperationResult(undefined);
      setValidationStatus('invalid');
      setFormError('強調表示されたフィールドを確認するとポリシー検証を続行できます。');
      focusFirstInvalidModelPolicyField(form, form.formState.errors);
      return;
    }
    setOperationResult(undefined);
    setValidationStatus('validating');
    setFormError(undefined);
    const draft = form.getValues();
    const operationKey = generateIdempotencyKey();
    setReconciliationOperation({ draft, operationKey });
    const result = await onSavePolicy(operationKey, draft);
    setOperationResult(result);
    applyPolicyResult(result, setValidationStatus, setWarnings, setFormError);
    if (
      result.safeStatus === 'succeeded' &&
      result.displayData.ok &&
      result.displayData.metadata !== undefined
    ) {
      form.reset(metadataToDraft(result.displayData.metadata));
      setCurrentMetadata(result.displayData.metadata);
      setReconciliationOperation(undefined);
    }
    if (result.displayData.reconciliationRequired !== true) {
      setReconciliationOperation(undefined);
    }
  };
  const handleReconcile = (): Promise<void> =>
    runModelPolicyReconciliation({
      form,
      onReconcilePolicy,
      pending,
      reconciliationOperation,
      reconciliationPending,
      reconciliationRequired,
      setCurrentMetadata,
      setFormError,
      setOperationResult,
      setReconciliationError,
      setReconciliationOperation,
      setReconciliationPending,
      setValidationStatus,
      setWarnings,
    });
  return (
    <ModelPolicySettingsEditor
      agentId={agentId}
      currentMetadata={currentMetadata}
      form={form}
      formError={formError}
      reconciliationError={reconciliationError}
      operationResult={operationResult}
      pending={pending}
      permissionDenied={permissionDenied}
      reconciliationPending={reconciliationPending}
      reconciliationRequired={reconciliationRequired}
      mutationLocked={mutationLocked}
      validationStatus={validationStatus}
      warnings={warnings}
      onReconcile={handleReconcile}
      onSave={handleSave}
      onValidate={handleValidate}
    />
  );
}

interface RunModelPolicyReconciliationInput {
  readonly form: UseFormReturn<SettingsModelPolicyValues>;
  readonly onReconcilePolicy: ModelPolicySettingsSectionProps['onReconcilePolicy'];
  readonly pending: boolean;
  readonly reconciliationPending: boolean;
  readonly reconciliationRequired: boolean;
  readonly reconciliationOperation: ModelPolicyReconciliationOperation | undefined;
  readonly setCurrentMetadata: Dispatch<SetStateAction<BrowserSafeModelPolicyMetadata | undefined>>;
  readonly setFormError: Dispatch<SetStateAction<string | undefined>>;
  readonly setOperationResult: Dispatch<
    SetStateAction<BrowserSafeModelPolicyMutationResult | undefined>
  >;
  readonly setReconciliationError: Dispatch<SetStateAction<string | undefined>>;
  readonly setReconciliationOperation: Dispatch<
    SetStateAction<ModelPolicyReconciliationOperation | undefined>
  >;
  readonly setReconciliationPending: Dispatch<SetStateAction<boolean>>;
  readonly setValidationStatus: Dispatch<SetStateAction<ModelPolicyValidationStatus>>;
  readonly setWarnings: Dispatch<SetStateAction<readonly BrowserSafeModelPolicyWarning[]>>;
}

async function runModelPolicyReconciliation({
  form,
  onReconcilePolicy,
  pending,
  reconciliationPending,
  reconciliationRequired,
  reconciliationOperation,
  setCurrentMetadata,
  setFormError,
  setOperationResult,
  setReconciliationError,
  setReconciliationOperation,
  setReconciliationPending,
  setValidationStatus,
  setWarnings,
}: RunModelPolicyReconciliationInput): Promise<void> {
  if (
    reconciliationOperation === undefined ||
    !reconciliationRequired ||
    pending ||
    reconciliationPending
  ) {
    return;
  }
  // 新しい command key を作らず、前回 save の parent key/draft をそのまま GetConfig 照合 action へ渡します。
  setReconciliationPending(true);
  setReconciliationError(undefined);
  setFormError(undefined);
  try {
    const result = await onReconcilePolicy(
      reconciliationOperation.operationKey,
      reconciliationOperation.draft
    );
    setOperationResult(result);
    applyPolicyResult(result, setValidationStatus, setWarnings, setFormError);
    if (result.safeStatus === 'succeeded' && result.displayData.metadata !== undefined) {
      form.reset(metadataToDraft(result.displayData.metadata));
      setCurrentMetadata(result.displayData.metadata);
      setReconciliationOperation(undefined);
    }
  } catch {
    // Server Action 契約外の rejection でも raw diagnostic は描画せず、draft と直前 summary を保持して再確認を案内します。
    setReconciliationError(
      '適用状態を確認できませんでした。時間をおいて「適用状態を確認」を実行してください。'
    );
  } finally {
    setReconciliationPending(false);
  }
}

const SETTINGS_MODEL_POLICY_FIELD_ORDER = [
  'policyRef',
  'provider',
  'model',
  'temperature',
  'topP',
  'maxOutputTokens',
] as const satisfies readonly (keyof SettingsModelPolicyValues)[];

function collectModelPolicyValidationItems(
  fieldErrors: FieldErrors<SettingsModelPolicyValues>
): readonly ValidationSummaryItem<keyof SettingsModelPolicyValues>[] {
  const items: ValidationSummaryItem<keyof SettingsModelPolicyValues>[] = [];
  for (const fieldName of SETTINGS_MODEL_POLICY_FIELD_ORDER) {
    const message = getModelPolicyFieldErrorMessage(fieldErrors, fieldName);
    if (message !== undefined && message !== '') {
      items.push({ fieldName, label: resolveModelPolicyFieldLabel(fieldName), message });
    }
  }
  return items;
}

function focusFirstInvalidModelPolicyField(
  form: UseFormReturn<SettingsModelPolicyValues>,
  fieldErrors: FieldErrors<SettingsModelPolicyValues>
): void {
  for (const fieldName of SETTINGS_MODEL_POLICY_FIELD_ORDER) {
    if (getModelPolicyFieldErrorMessage(fieldErrors, fieldName) !== undefined) {
      form.setFocus(fieldName);
      return;
    }
  }
}

function getModelPolicyFieldErrorMessage(
  fieldErrors: FieldErrors<SettingsModelPolicyValues>,
  fieldName: keyof SettingsModelPolicyValues
): string | undefined {
  const error =
    fieldName === 'policyRef'
      ? fieldErrors.policyRef
      : fieldName === 'provider'
        ? fieldErrors.provider
        : fieldName === 'model'
          ? fieldErrors.model
          : fieldName === 'temperature'
            ? fieldErrors.temperature
            : fieldName === 'topP'
              ? fieldErrors.topP
              : fieldErrors.maxOutputTokens;
  return typeof error?.message === 'string' ? error.message : undefined;
}

function resolveModelPolicyFieldLabel(fieldName: keyof SettingsModelPolicyValues): string {
  if (fieldName === 'policyRef') return 'ポリシー参照';
  if (fieldName === 'provider') return 'プロバイダー';
  if (fieldName === 'model') return 'モデルID';
  if (fieldName === 'temperature') return '温度';
  if (fieldName === 'topP') return 'Top P';
  return '最大出力トークン数';
}

interface ModelPolicySettingsEditorProps {
  readonly agentId: string;
  readonly currentMetadata: BrowserSafeModelPolicyMetadata | undefined;
  readonly form: UseFormReturn<SettingsModelPolicyValues>;
  readonly formError: string | undefined;
  readonly reconciliationError: string | undefined;
  readonly operationResult: BrowserSafeModelPolicyMutationResult | undefined;
  readonly pending: boolean;
  readonly permissionDenied: boolean;
  readonly reconciliationPending: boolean;
  readonly reconciliationRequired: boolean;
  readonly mutationLocked: boolean;
  readonly validationStatus: ModelPolicyValidationStatus;
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
  readonly onReconcile: () => Promise<void>;
  readonly onSave: () => Promise<void>;
  readonly onValidate: () => Promise<void>;
}

function ModelPolicySettingsEditor({
  agentId,
  currentMetadata,
  form,
  formError,
  reconciliationError,
  operationResult,
  pending,
  permissionDenied,
  reconciliationPending,
  reconciliationRequired,
  mutationLocked,
  validationStatus,
  warnings,
  onReconcile,
  onSave,
  onValidate,
}: ModelPolicySettingsEditorProps) {
  const { errors: fieldErrors } = useFormState({ control: form.control });
  const validationItems = collectModelPolicyValidationItems(fieldErrors);
  return (
    <section aria-labelledby="model-policy-editor-heading">
      <ModelPolicySummary
        metadata={currentMetadata}
        loading={false}
        permissionDenied={permissionDenied}
      />
      <div className="space-y-1 text-sm">
        <strong id="model-policy-editor-heading">既定モデルポリシーを編集</strong>
        <p className="text-xs text-muted-foreground">
          Agent所有ポリシーを保存してから、保存済みの参照をAgentConfig.modelPolicyRefへ適用します。ブラウザーには安全化済みの結果を返します。
        </p>
        {operationResult === undefined ? (
          <ValidationSummary
            heading="ポリシーの入力内容を確認してください"
            formError={formError}
            items={validationItems}
            onFocusField={(fieldName) => {
              form.setFocus(fieldName);
            }}
          />
        ) : null}
        <Form {...form}>
          <form
            onSubmit={(event) => {
              // Enter submit でも Save button と同じ validation と Server Action wrapper を使う。
              event.preventDefault();
              void onSave();
            }}
            noValidate
            aria-busy={pending || reconciliationPending || validationStatus === 'validating'}
          >
            <OperationResultRegion
              result={operationResult}
              pending={pending || reconciliationPending || validationStatus === 'validating'}
              pendingTitle={
                reconciliationPending
                  ? '既定モデルポリシーの適用状態を確認しています'
                  : validationStatus === 'validating'
                    ? '既定モデルポリシーを検証しています'
                    : '既定モデルポリシーを保存しています'
              }
              pendingMessage={
                reconciliationPending
                  ? 'サーバー側の設定と既定モデルポリシーを照合しています…'
                  : validationStatus === 'validating'
                    ? '入力したポリシーをサーバー側Agentで検証しています…'
                    : 'ポリシーを保存し、Agent設定へ適用しています…'
              }
            >
              {reconciliationError !== undefined ? (
                <p className="mt-4 text-sm text-destructive">{reconciliationError}</p>
              ) : null}
              {operationResult?.safeStatus === 'failed' &&
              operationResult.safeErrorCategory === 'configuration' &&
              !reconciliationRequired ? (
                <Button asChild type="button" variant="outline" className="mt-4 min-h-11">
                  <Link href={`/agents/new?edit=${encodeURIComponent(agentId)}`}>
                    登録情報を編集
                  </Link>
                </Button>
              ) : null}
              {reconciliationRequired ? (
                <Button
                  type="button"
                  className="mt-4 min-h-11"
                  aria-disabled={pending || reconciliationPending}
                  aria-busy={reconciliationPending}
                  onClick={() => {
                    void onReconcile();
                  }}
                >
                  適用状態を確認
                </Button>
              ) : null}
            </OperationResultRegion>
            <ModelPolicyFields
              form={form}
              names={buildModelPolicyFieldNames<SettingsModelPolicyValues>('')}
              mode="settings"
              disabled={mutationLocked}
              validationStatus={validationStatus}
              warnings={warnings}
              onValidate={() => {
                void onValidate();
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="default"
                className="min-h-11"
                disabled={
                  permissionDenied || (reconciliationRequired && !reconciliationPending && !pending)
                }
                aria-disabled={mutationLocked}
                aria-busy={pending}
              >
                {pending ? '保存しています…' : '既定ポリシーを保存'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
      <p className="text-xs text-muted-foreground">Agent ID: {agentId}</p>
    </section>
  );
}

function metadataToDraft(
  metadata: BrowserSafeModelPolicyMetadata | undefined
): SettingsModelPolicyValues {
  if (metadata === undefined) {
    return buildDefaultModelPolicyDraftValues();
  }
  return {
    policyRef: metadata.policyRef,
    provider: metadata.provider,
    model: metadata.model,
    temperature: metadata.generationParameters?.temperature ?? '0.20',
    topP: metadata.generationParameters?.topP ?? '0.90',
    maxOutputTokens: metadata.generationParameters?.maxOutputTokens ?? '1024',
  };
}

function resolveModelPolicyMutationLock(
  pending: boolean,
  reconciliationPending: boolean,
  validationStatus: ModelPolicyValidationStatus,
  permissionDenied: boolean,
  reconciliationRequired: boolean
): boolean {
  // validation・reconciliation・permission failure の全てで mutation 起点と field group を同じ lock に揃える。
  return (
    pending ||
    reconciliationPending ||
    validationStatus === 'validating' ||
    permissionDenied ||
    reconciliationRequired
  );
}

function applyPolicyResult(
  result: BrowserSafeModelPolicyMutationResult,
  setValidationStatus: (status: ModelPolicyValidationStatus) => void,
  setWarnings: (warnings: readonly BrowserSafeModelPolicyWarning[]) => void,
  setFormError: (message: string | undefined) => void
): void {
  setWarnings(result.displayData.warnings);
  if (result.safeStatus === 'succeeded' && result.displayData.ok) {
    setValidationStatus(result.displayData.warnings.length > 0 ? 'warning' : 'valid');
    setFormError(undefined);
    return;
  }
  setValidationStatus(
    result.safeErrorCategory === 'permission_denied' ? 'permission_denied' : 'invalid'
  );
  setFormError(result.displayData.message);
}
