'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

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
  }, [form, initialMetadata]);

  const permissionDenied = operationResult?.safeErrorCategory === 'permission_denied';

  const handleValidate = async (): Promise<void> => {
    if (permissionDenied) {
      setFormError('既定モデルポリシーの更新権限を確認してください。');
      return;
    }
    const valid = await form.trigger();
    if (!valid) {
      setValidationStatus('invalid');
      setFormError('強調表示されたフィールドを確認するとポリシー検証を続行できます。');
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
    const valid = await form.trigger();
    if (!valid) {
      setValidationStatus('invalid');
      setFormError('強調表示されたフィールドを確認するとポリシー検証を続行できます。');
      return;
    }
    setValidationStatus('validating');
    setFormError(undefined);
    const result = await onSavePolicy(generateIdempotencyKey(), form.getValues());
    setOperationResult(result);
    applyPolicyResult(result, setValidationStatus, setWarnings, setFormError);
    if (
      result.safeStatus === 'succeeded' &&
      result.displayData.ok &&
      result.displayData.metadata !== undefined
    ) {
      form.reset(metadataToDraft(result.displayData.metadata));
      setCurrentMetadata(result.displayData.metadata);
    }
  };

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
        {formError !== undefined && operationResult === undefined ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <Form {...form}>
          <form
            onSubmit={(event) => {
              // Enter submit でも Save button と同じ validation と Server Action wrapper を使う。
              event.preventDefault();
              void handleSave();
            }}
            noValidate
            aria-busy={pending || validationStatus === 'validating'}
          >
            <OperationResultRegion
              result={operationResult}
              pending={pending}
              pendingTitle="既定モデルポリシーを保存しています"
              pendingMessage="ポリシーを保存し、Agent設定へ適用しています…"
            >
              {operationResult?.safeStatus === 'failed' &&
              operationResult.safeErrorCategory === 'configuration' ? (
                <Button asChild type="button" variant="outline" className="mt-4 min-h-11">
                  <Link href={`/agents/new?edit=${encodeURIComponent(agentId)}`}>
                    登録情報を編集
                  </Link>
                </Button>
              ) : null}
            </OperationResultRegion>
            <ModelPolicyFields
              form={form}
              names={buildModelPolicyFieldNames<SettingsModelPolicyValues>('')}
              mode="settings"
              disabled={pending || permissionDenied}
              validationStatus={validationStatus}
              warnings={warnings}
              onValidate={() => {
                void handleValidate();
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="default"
                className="min-h-11"
                disabled={pending || permissionDenied}
                aria-disabled={pending || permissionDenied}
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
