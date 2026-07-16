'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type UseFormReturn, useForm } from 'react-hook-form';

import { AgentConfigSection } from './agent-config-section';
import { AgentToken } from './agent-token';
import { ConfirmDialog } from './confirm-dialog';
import { ControlRoomFrame } from './control-room-frame';
import { CredentialRotationSection } from './credential-rotation-section';
import { ErrorAlert } from './error-alert';
import { generateIdempotencyKey } from './generate-idempotency-key';
import { ModelPolicySettingsSection } from './model-policy-settings-section';
import {
  buildDestroyConfirmSchema,
  parseAgentConfigJson,
  type CredentialReferenceValues,
  type DestroyConfirmValues,
} from './schemas/agent-settings';
import { DangerZoneSection, DestroyConfirmField } from './settings-danger-zone';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';
import type {
  BrowserSafeModelPolicyMetadata,
  BrowserSafeModelPolicyMutationResult,
  BrowserSafeModelPolicySaveResult,
  ModelPolicyDraftValues,
} from './schemas/model-policy';

interface ConfigSnapshot {
  readonly agentId: string;
  readonly configVersion: string;
  readonly config?: Record<string, unknown>;
}

interface CredentialSnapshot {
  readonly credentialId?: string;
  readonly status: string;
  readonly keyId?: string;
  readonly generation?: number;
  readonly maskedHint?: string;
}

interface AgentSettingsFormProps {
  readonly agentId: string;
  readonly displayName: string;
  readonly initialConfig: ConfigSnapshot;
  readonly currentCredential?: CredentialSnapshot;
  readonly initialModelPolicy?: BrowserSafeModelPolicyMetadata;
  readonly actingOperatorId: string;
  readonly initialNotice?: string;
  readonly onUpdateConfig: (
    agentId: string,
    idempotencyKey: string,
    config: Record<string, unknown>
  ) => Promise<BrowserSafeActionResult<ConfigSnapshot>>;
  readonly onRotateCredential: (
    agentId: string,
    idempotencyKey: string
  ) => Promise<
    BrowserSafeActionResult<{
      readonly credential?: CredentialSnapshot;
      readonly previousCredential?: CredentialSnapshot;
    }>
  >;
  readonly onSaveAccessLookup: (input: {
    readonly agentId: string;
    readonly referenceValue: string;
    readonly keyId: string;
    readonly fingerprintValue: string;
    readonly maskedHint: string;
    readonly status: string;
  }) => Promise<unknown>;
  readonly onValidateModelPolicy: (
    agentId: string,
    draft: ModelPolicyDraftValues
  ) => Promise<BrowserSafeModelPolicyMutationResult>;
  readonly onSaveDefaultModelPolicy: (
    agentId: string,
    idempotencyKey: string,
    draft: ModelPolicyDraftValues
  ) => Promise<BrowserSafeModelPolicySaveResult>;
  readonly onReconcileDefaultModelPolicy: (
    agentId: string,
    operationKey: string,
    draft: ModelPolicyDraftValues
  ) => Promise<BrowserSafeModelPolicySaveResult>;
  readonly onDestroy: (
    agentId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<BrowserSafeActionResult<{ readonly status: string }>>;
}

type BrowserSafeActionResult<TData> = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & { readonly data?: TData }
>;

interface SettingsState {
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly success: string | undefined;
  readonly destroyDialogOpen: boolean;
}

const INITIAL_STATE: SettingsState = {
  pending: false,
  error: undefined,
  success: undefined,
  destroyDialogOpen: false,
};

/**
 * Agent settings 画面全体の Client Component form shell を描画します。
 *
 * @param props - Agent ID、表示名、現在 config、credential summary、acting operator、Server Action wrappers を含む settings 入力です。
 * @returns config update、credential rotation、credential reference 保存、destroy confirmation をまとめた settings UI を返します。
 * @remarks
 * この component は Browser で form state と確認 dialog だけを管理し、Agent RPC、credential 解決、Client D1 write はすべて
 * 親から渡された Server Action wrapper に委譲します。config、credential reference、destroy confirm の入力はそれぞれ
 * `react-hook-form`、`zodResolver`、shadcn `Form` composition を使い、wireframe §4.6/§5.1/§6.4 の form 境界を満たします。
 * Server Action 失敗時は safe message だけを `ErrorAlert` で表示し、credential lookup payload や stack trace は描画しません。
 *
 * @example
 * ```tsx
 * <AgentSettingsForm
 *   agentId="agent-alpha"
 *   displayName="Agent Alpha"
 *   initialConfig={{ agentId: 'agent-alpha', configVersion: '1', config: {} }}
 *   actingOperatorId="operator-1"
 *   onUpdateConfig={updateConfigAction}
 *   onRotateCredential={rotateCredentialAction}
 *   onSaveAccessLookup={saveLookupAction}
 *   onDestroy={destroyAction}
 * />
 * ```
 */
export function AgentSettingsForm(props: AgentSettingsFormProps) {
  const router = useRouter();
  const [state, setState] = useState<SettingsState>(INITIAL_STATE);
  const destroyForm = useForm<DestroyConfirmValues>({
    resolver: zodResolver(buildDestroyConfirmSchema(props.agentId)),
    defaultValues: { confirmAgentId: '' },
    mode: 'onChange',
    shouldFocusError: true,
  });

  const updateState = (patch: Partial<SettingsState>): void => {
    // settings 全体の mutation 状態を一箇所で更新し、各 section の pending/error/success 表示を同期する。
    setState((prev) => ({ ...prev, ...patch }));
  };

  const handlers = createSettingsHandlers(props, updateState, router);

  const handleOpenDestroyDialog = (): void => {
    // dialog を開くたびに type-to-confirm 入力を空へ戻し、前回の Agent ID 入力を再利用させない。
    destroyForm.reset({ confirmAgentId: '' });
    updateState({ destroyDialogOpen: true });
  };

  const handleCancelDestroy = (): void => {
    // cancel 時は dialog と form state の両方を閉じ、破壊操作の誤送信余地を残さない。
    destroyForm.reset({ confirmAgentId: '' });
    updateState({ destroyDialogOpen: false });
  };

  const handleConfirmDestroy = async (): Promise<void> => {
    // confirm button 経由でも RHF/Zod を再実行し、Agent ID echo が一致しない破壊操作を Server Action に渡さない。
    const valid = await destroyForm.trigger('confirmAgentId');
    if (!valid) {
      destroyForm.setFocus('confirmAgentId');
      return;
    }
    await handlers.handleDestroy();
  };

  return (
    <ControlRoomFrame title={`Agentレジストリ › ${props.agentId}`} signalLabel="設定">
      <SettingsContent
        {...props}
        state={state}
        destroyForm={destroyForm}
        onSaveConfig={handlers.handleSaveConfig}
        onValidatePolicyDraft={handlers.handleValidateModelPolicy}
        onSaveDefaultPolicyDraft={handlers.handleSaveDefaultModelPolicy}
        onRotate={handlers.handleRotate}
        onSaveNewReference={handlers.handleSaveNewReference}
        onOpenDestroyDialog={handleOpenDestroyDialog}
        onConfirmDestroy={handleConfirmDestroy}
        onCancelDestroy={handleCancelDestroy}
      />
    </ControlRoomFrame>
  );
}

interface SettingsHandlers {
  readonly handleSaveConfig: (configJson: string) => Promise<boolean>;
  readonly handleValidateModelPolicy: (
    draft: ModelPolicyDraftValues
  ) => Promise<BrowserSafeModelPolicyMutationResult>;
  readonly handleSaveDefaultModelPolicy: (
    idempotencyKey: string,
    draft: ModelPolicyDraftValues
  ) => Promise<BrowserSafeModelPolicySaveResult>;
  readonly handleRotate: () => Promise<{ readonly generation: number } | undefined>;
  readonly handleSaveNewReference: (result: CredentialReferenceValues) => Promise<boolean>;
  readonly handleDestroy: () => Promise<void>;
}

function createSettingsHandlers(
  props: AgentSettingsFormProps,
  updateState: (patch: Partial<SettingsState>) => void,
  router: ReturnType<typeof useRouter>
): SettingsHandlers {
  const handleSaveConfig = async (configJson: string): Promise<boolean> => {
    updateState({ error: undefined, success: undefined });
    let parsed: Record<string, unknown>;
    try {
      // Zod validation 済みでも submit 直前に再 parse し、直接呼び出しや race で壊れた JSON を Server Action へ渡さない。
      parsed = parseAgentConfigJson(configJson);
    } catch {
      // parser/server exception の message を画面に渡さず、固定安全文言だけを表示します。
      updateState({ error: 'Config update failed.' });
      return false;
    }
    updateState({ pending: true });
    try {
      const result = await props.onUpdateConfig(props.agentId, generateIdempotencyKey(), parsed);
      if (result.safeStatus === 'failed' || result.displayData.data === undefined) {
        updateState({ error: result.displayData.message });
        return false;
      }
      updateState({ success: result.displayData.message });
      router.refresh();
      return true;
    } catch {
      // Server Action 契約外の rejection でも raw diagnostic を表示しません。
      updateState({ error: 'Config update failed.' });
      return false;
    } finally {
      updateState({ pending: false });
    }
  };

  const handleValidateModelPolicy = async (
    draft: ModelPolicyDraftValues
  ): Promise<BrowserSafeModelPolicyMutationResult> => {
    // ポリシー検証は保存を伴わないため、設定全体の保存 pending に混在させません。
    // `ModelPolicyFields` が検証専用の live status と control disabled 状態を担当します。
    updateState({ error: undefined, success: undefined });
    try {
      return await props.onValidateModelPolicy(props.agentId, draft);
    } catch {
      return createModelPolicyValidationFailure();
    }
  };

  const handleSaveDefaultModelPolicy = async (
    idempotencyKey: string,
    draft: ModelPolicyDraftValues
  ): Promise<BrowserSafeModelPolicySaveResult> => {
    updateState({ error: undefined, success: undefined, pending: true });
    try {
      const result = await props.onSaveDefaultModelPolicy(props.agentId, idempotencyKey, draft);
      if (
        result.safeStatus === 'succeeded' &&
        result.displayData.ok &&
        result.displayData.metadata !== undefined
      ) {
        // 保存成功の通知と metadata 更新は ModelPolicySettingsSection の単一 ResultRegion が担います。
        router.refresh();
      }
      return result;
    } catch {
      return createModelPolicySaveFailure();
    } finally {
      updateState({ pending: false });
    }
  };

  const handleRotate = async (): Promise<{ readonly generation: number } | undefined> => {
    updateState({ error: undefined, success: undefined, pending: true });
    try {
      const result = await props.onRotateCredential(props.agentId, generateIdempotencyKey());
      if (result.safeStatus === 'failed' || result.displayData.data === undefined) {
        updateState({ error: result.displayData.message });
        return undefined;
      }
      const generation = result.displayData.data.credential?.generation ?? 0;
      updateState({
        success:
          result.displayData.data.credential !== undefined
            ? `Credential generation ${String(generation)} is active.`
            : 'Credential rotation accepted.',
      });
      router.refresh();
      return { generation };
    } catch {
      // credential rotation の例外詳細は Browser に出さず、固定安全文言へ丸めます。
      updateState({
        error: 'Credential rotation failed.',
      });
      return undefined;
    } finally {
      updateState({ pending: false });
    }
  };

  const handleSaveNewReference = async (result: CredentialReferenceValues): Promise<boolean> => {
    updateState({ error: undefined, success: undefined, pending: true });
    try {
      await props.onSaveAccessLookup({
        agentId: props.agentId,
        referenceValue: result.referenceValue,
        keyId: result.keyId,
        fingerprintValue: result.fingerprintValue,
        maskedHint: result.maskedHint,
        status: 'active',
      });
      updateState({ success: 'New credential reference saved.' });
      router.refresh();
      return true;
    } catch {
      // Client D1 action の内部 detail は管理画面へ返さず、再試行可能な固定文言を使います。
      updateState({
        error: 'Could not save credential reference.',
      });
      return false;
    } finally {
      updateState({ pending: false });
    }
  };

  const handleDestroy = async (): Promise<void> => {
    updateState({ error: undefined, success: undefined, pending: true });
    try {
      const result = await props.onDestroy(
        props.agentId,
        generateIdempotencyKey(),
        'destroyed from management UI'
      );
      if (result.safeStatus === 'failed') {
        updateState({ error: result.displayData.message });
        return;
      }
      router.push('/agents');
    } catch {
      // destroy action の raw error は安全な result contract 外なので Browser 表示へ使いません。
      updateState({
        error: 'Agent destruction failed.',
        pending: false,
      });
    }
  };

  return {
    handleSaveConfig,
    handleValidateModelPolicy,
    handleSaveDefaultModelPolicy,
    handleRotate,
    handleSaveNewReference,
    handleDestroy,
  };
}

function createModelPolicyValidationFailure(): BrowserSafeModelPolicyMutationResult {
  return {
    correlationId: globalThis.crypto.randomUUID(),
    displayData: {
      fieldErrors: {},
      message: 'ポリシーの検証結果を確認できません。時間をおいてもう一度実行してください。',
      ok: false,
      title: '操作を再実行できます',
      warnings: [],
    },
    safeErrorCategory: 'internal',
    safeStatus: 'failed',
  };
}

function createModelPolicySaveFailure(): BrowserSafeModelPolicySaveResult {
  return {
    correlationId: globalThis.crypto.randomUUID(),
    displayData: {
      configVersion: undefined,
      fieldErrors: {},
      message:
        'Agent設定は直前の確定値を保持しています。時間をおいて「もう一度保存」を実行してください。',
      ok: false,
      title: '操作を再実行できます',
      warnings: [],
    },
    safeErrorCategory: 'internal',
    safeStatus: 'failed',
  };
}

interface SettingsContentProps extends AgentSettingsFormProps {
  readonly state: SettingsState;
  readonly destroyForm: UseFormReturn<DestroyConfirmValues>;
  readonly onSaveConfig: (configJson: string) => Promise<boolean>;
  readonly onValidatePolicyDraft: (
    draft: ModelPolicyDraftValues
  ) => Promise<BrowserSafeModelPolicyMutationResult>;
  readonly onSaveDefaultPolicyDraft: (
    idempotencyKey: string,
    draft: ModelPolicyDraftValues
  ) => Promise<BrowserSafeModelPolicySaveResult>;
  readonly onRotate: () => Promise<{ readonly generation: number } | undefined>;
  readonly onSaveNewReference: (result: CredentialReferenceValues) => Promise<boolean>;
  readonly onOpenDestroyDialog: () => void;
  readonly onConfirmDestroy: () => Promise<void>;
  readonly onCancelDestroy: () => void;
}

function SettingsContent({
  agentId,
  displayName,
  initialConfig,
  initialModelPolicy,
  currentCredential,
  actingOperatorId,
  initialNotice,
  state,
  destroyForm,
  onSaveConfig,
  onValidatePolicyDraft,
  onSaveDefaultPolicyDraft,
  onReconcileDefaultModelPolicy,
  onRotate,
  onSaveNewReference,
  onOpenDestroyDialog,
  onConfirmDestroy,
  onCancelDestroy,
}: SettingsContentProps) {
  return (
    <>
      <h2>Agent設定とcredential</h2>
      <AgentToken agentId={agentId} />
      <p className="text-sm text-muted-foreground">
        「{displayName}」を管理しています。変更はサーバー側Agent RPCを通じて送信されます。
      </p>

      {initialNotice !== undefined ? (
        <ErrorAlert title="Agent RPC notice" message={initialNotice} />
      ) : null}
      {state.error !== undefined ? <ErrorAlert message={state.error} /> : null}
      {state.success !== undefined ? (
        <div
          className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm"
          role="status"
        >
          <strong>Success</strong>
          <span>{state.success}</span>
        </div>
      ) : null}

      <ModelPolicySettingsSection
        agentId={agentId}
        initialMetadata={initialModelPolicy}
        pending={state.pending}
        onValidatePolicy={onValidatePolicyDraft}
        onSavePolicy={onSaveDefaultPolicyDraft}
        onReconcilePolicy={(operationKey, draft) =>
          onReconcileDefaultModelPolicy(agentId, operationKey, draft)
        }
      />

      <AgentConfigSection
        configVersion={initialConfig.configVersion}
        initialConfigJson={
          initialConfig.config === undefined ? '{}' : JSON.stringify(initialConfig.config, null, 2)
        }
        pending={state.pending}
        onSave={onSaveConfig}
      />

      <CredentialRotationSection
        actingOperatorId={actingOperatorId}
        currentCredential={currentCredential}
        pending={state.pending}
        onRotate={onRotate}
        onSaveReference={onSaveNewReference}
      />

      <DangerZoneSection pending={state.pending} onOpenDestroyDialog={onOpenDestroyDialog} />

      <ConfirmDialog
        open={state.destroyDialogOpen}
        heading={`Destroy Agent ${agentId}?`}
        confirmLabel="Destroy permanently"
        onConfirm={onConfirmDestroy}
        onCancel={onCancelDestroy}
        pending={state.pending}
        confirmDisabled={state.pending || !destroyForm.formState.isValid}
      >
        <p>
          This disables all mutating Agent operations. History is preserved. This action is
          irreversible.
        </p>
        <DestroyConfirmField
          form={destroyForm}
          agentId={agentId}
          pending={state.pending}
          onConfirm={onConfirmDestroy}
        />
      </ConfirmDialog>
    </>
  );
}
