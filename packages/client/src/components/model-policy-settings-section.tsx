'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { generateIdempotencyKey } from './generate-idempotency-key';
import {
  buildModelPolicyFieldNames,
  ModelPolicyFields,
  type ModelPolicyValidationStatus,
} from './model-policy-fields';
import { ModelPolicySummary } from './model-policy-summary';
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
  const [success, setSuccess] = useState<string | undefined>();
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
    setValidationStatus('idle');
    setFormError(undefined);
    setSuccess(undefined);
  }, [form, initialMetadata]);

  const permissionDenied = validationStatus === 'permission_denied';

  const handleValidate = async (): Promise<void> => {
    if (permissionDenied) {
      setFormError('You do not have permission to update the default model policy.');
      return;
    }
    const valid = await form.trigger();
    if (!valid) {
      setValidationStatus('invalid');
      setFormError('The policy draft is invalid. Fix the highlighted fields and validate again.');
      return;
    }
    setValidationStatus('validating');
    setFormError(undefined);
    const result = await onValidatePolicy(form.getValues());
    applyPolicyResult(result, setValidationStatus, setWarnings, setFormError);
  };

  const handleSave = async (): Promise<void> => {
    if (permissionDenied) {
      setFormError('You do not have permission to update the default model policy.');
      return;
    }
    const valid = await form.trigger();
    if (!valid) {
      setValidationStatus('invalid');
      setFormError('The policy draft is invalid. Fix the highlighted fields and validate again.');
      return;
    }
    setValidationStatus('validating');
    setFormError(undefined);
    setSuccess(undefined);
    const result = await onSavePolicy(generateIdempotencyKey(), form.getValues());
    applyPolicyResult(result, setValidationStatus, setWarnings, setFormError);
    if (result.ok && result.metadata !== undefined) {
      form.reset(metadataToDraft(result.metadata));
      setSuccess(
        `Default model policy saved as ${result.metadata.policyRef}; config updated to v${result.configVersion ?? result.metadata.configVersion ?? 'unknown'}.`
      );
    }
  };

  return (
    <section aria-labelledby="model-policy-editor-heading">
      <ModelPolicySummary
        metadata={initialMetadata}
        loading={false}
        permissionDenied={permissionDenied}
      />
      <div className="rounded-md border bg-card p-4 text-sm space-y-1">
        <strong id="model-policy-editor-heading">Edit default model policy</strong>
        <p className="text-xs text-muted-foreground">
          Upsert the Agent-owned policy first, then attach the saved ref to
          AgentConfig.modelPolicyRef. The browser receives only the safe result metadata.
        </p>
        {formError !== undefined ? (
          <p className="text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        {success !== undefined ? (
          <p className="text-primary" role="status">
            {success}
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
          >
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
                disabled={pending || permissionDenied}
                aria-disabled={pending || permissionDenied}
              >
                {pending ? 'Saving default policy…' : 'Save default policy'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
      <p className="text-xs text-muted-foreground">Policy editor for Agent ID: {agentId}</p>
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
  setWarnings(result.warnings);
  if (result.ok) {
    setValidationStatus(result.warnings.length > 0 ? 'warning' : 'valid');
    setFormError(undefined);
    return;
  }
  setValidationStatus(
    result.errorCategory === 'permission_denied' ? 'permission_denied' : 'invalid'
  );
  setFormError(result.formError ?? 'Default model policy could not be saved.');
}
