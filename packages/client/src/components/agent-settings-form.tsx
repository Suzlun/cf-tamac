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
import {
  buildDestroyConfirmSchema,
  parseAgentConfigJson,
  type CredentialReferenceValues,
  type DestroyConfirmValues,
} from './schemas/agent-settings';
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
  readonly actingOperatorId: string;
  readonly initialNotice?: string;
  readonly onUpdateConfig: (
    agentId: string,
    idempotencyKey: string,
    config: Record<string, unknown>
  ) => Promise<ConfigSnapshot>;
  readonly onRotateCredential: (
    agentId: string,
    idempotencyKey: string
  ) => Promise<{
    readonly credential?: CredentialSnapshot;
    readonly previousCredential?: CredentialSnapshot;
  }>;
  readonly onSaveAccessLookup: (input: {
    readonly agentId: string;
    readonly referenceValue: string;
    readonly keyId: string;
    readonly fingerprintValue: string;
    readonly maskedHint: string;
    readonly status: string;
  }) => Promise<unknown>;
  readonly onDestroy: (
    agentId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<{ readonly status: string }>;
}

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
    <ControlRoomFrame
      title={`Agent registry › ${props.agentId}`}
      signalLabel="settings"
      agentId={props.agentId}
      currentSection="settings"
    >
      <SettingsContent
        {...props}
        state={state}
        destroyForm={destroyForm}
        onSaveConfig={handlers.handleSaveConfig}
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
    } catch (error_) {
      updateState({ error: error_ instanceof Error ? error_.message : 'Config update failed.' });
      return false;
    }
    updateState({ pending: true });
    try {
      const result = await props.onUpdateConfig(props.agentId, generateIdempotencyKey(), parsed);
      updateState({ success: `Config updated to v${result.configVersion}.` });
      router.refresh();
      return true;
    } catch (error_) {
      updateState({ error: error_ instanceof Error ? error_.message : 'Config update failed.' });
      return false;
    } finally {
      updateState({ pending: false });
    }
  };

  const handleRotate = async (): Promise<{ readonly generation: number } | undefined> => {
    updateState({ error: undefined, success: undefined, pending: true });
    try {
      const result = await props.onRotateCredential(props.agentId, generateIdempotencyKey());
      const generation = result.credential?.generation ?? 0;
      updateState({
        success:
          result.credential !== undefined
            ? `Credential generation ${String(generation)} is active.`
            : 'Credential rotation accepted.',
      });
      router.refresh();
      return { generation };
    } catch (error_) {
      updateState({
        error: error_ instanceof Error ? error_.message : 'Credential rotation failed.',
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
    } catch (error_) {
      updateState({
        error: error_ instanceof Error ? error_.message : 'Could not save credential reference.',
      });
      return false;
    } finally {
      updateState({ pending: false });
    }
  };

  const handleDestroy = async (): Promise<void> => {
    updateState({ error: undefined, success: undefined, pending: true });
    try {
      await props.onDestroy(
        props.agentId,
        generateIdempotencyKey(),
        'destroyed from management UI'
      );
      router.push('/agents');
    } catch (error_) {
      updateState({
        error: error_ instanceof Error ? error_.message : 'Agent destruction failed.',
        pending: false,
      });
    }
  };

  return { handleSaveConfig, handleRotate, handleSaveNewReference, handleDestroy };
}

interface SettingsContentProps extends AgentSettingsFormProps {
  readonly state: SettingsState;
  readonly destroyForm: UseFormReturn<DestroyConfirmValues>;
  readonly onSaveConfig: (configJson: string) => Promise<boolean>;
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
  currentCredential,
  actingOperatorId,
  initialNotice,
  state,
  destroyForm,
  onSaveConfig,
  onRotate,
  onSaveNewReference,
  onOpenDestroyDialog,
  onConfirmDestroy,
  onCancelDestroy,
}: SettingsContentProps) {
  return (
    <>
      <p className="eyebrow">Settings</p>
      <h2>Agent configuration and credentials</h2>
      <AgentToken agentId={agentId} />
      <p className="lead">
        Managing {displayName}. Changes are sent through server-side Agent RPC.
      </p>

      {initialNotice !== undefined ? (
        <ErrorAlert title="Agent RPC notice" message={initialNotice} />
      ) : null}
      {state.error !== undefined ? <ErrorAlert message={state.error} /> : null}
      {state.success !== undefined ? (
        <div className="state-success readout" role="status">
          <strong>Success</strong>
          <span>{state.success}</span>
        </div>
      ) : null}

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

interface DestroyConfirmFieldProps {
  readonly form: UseFormReturn<DestroyConfirmValues>;
  readonly agentId: string;
  readonly pending: boolean;
  readonly onConfirm: () => Promise<void>;
}

function DestroyConfirmField({ form, agentId, pending, onConfirm }: DestroyConfirmFieldProps) {
  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          // Enter submit でも ConfirmDialog と同じ validation/Server Action path に統一する。
          event.preventDefault();
          void onConfirm();
        }}
        noValidate
      >
        <RhfFormField
          control={form.control}
          name="confirmAgentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{`Type the Agent ID "${agentId}" to confirm`}</FormLabel>
              <FormDescription>
                Destroy confirmation is enabled only when the value exactly matches this Agent ID.
              </FormDescription>
              <FormControl>
                <Input {...field} disabled={pending} autoComplete="off" required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

interface DangerZoneSectionProps {
  readonly pending: boolean;
  readonly onOpenDestroyDialog: () => void;
}

function DangerZoneSection({ pending, onOpenDestroyDialog }: DangerZoneSectionProps) {
  return (
    <section className="readout" aria-labelledby="danger-heading">
      <strong id="danger-heading">Danger zone</strong>
      <Button
        type="button"
        variant="destructive"
        onClick={onOpenDestroyDialog}
        disabled={pending}
        aria-disabled={pending}
      >
        Destroy Agent
      </Button>
    </section>
  );
}
