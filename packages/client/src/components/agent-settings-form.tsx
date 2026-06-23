'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';

import { AgentConfigSection } from './agent-config-section';
import { AgentToken } from './agent-token';
import { ConfirmDialog } from './confirm-dialog';
import { ControlRoomFrame } from './control-room-frame';
import { CredentialRotationSection } from './credential-rotation-section';
import { ErrorAlert } from './error-alert';
import { FormField } from './form-field';
import { generateIdempotencyKey } from './generate-idempotency-key';

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
  readonly destroyConfirmText: string;
}

const INITIAL_STATE: SettingsState = {
  pending: false,
  error: undefined,
  success: undefined,
  destroyDialogOpen: false,
  destroyConfirmText: '',
};

/**
 * Agent settings form with config update, credential rotation, and destruction.
 *
 * All mutations are confirmed in a dialog that echoes the acting operator ID.
 */
export function AgentSettingsForm(props: AgentSettingsFormProps) {
  const router = useRouter();
  const [state, setState] = useState<SettingsState>(INITIAL_STATE);

  const updateState = (patch: Partial<SettingsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const handlers = createSettingsHandlers(props, updateState, router);

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
        onSaveConfig={handlers.handleSaveConfig}
        onRotate={handlers.handleRotate}
        onSaveNewReference={handlers.handleSaveNewReference}
        onOpenDestroyDialog={() => {
          updateState({ destroyDialogOpen: true });
        }}
        onDestroyConfirmTextChange={(value) => {
          updateState({ destroyConfirmText: value });
        }}
        onConfirmDestroy={handlers.handleDestroy}
        onCancelDestroy={() => {
          updateState({ destroyDialogOpen: false });
        }}
      />
    </ControlRoomFrame>
  );
}

interface SettingsHandlers {
  readonly handleSaveConfig: (configJson: string) => Promise<boolean>;
  readonly handleRotate: () => Promise<{ readonly generation: number } | undefined>;
  readonly handleSaveNewReference: (result: {
    readonly referenceValue: string;
    readonly keyId: string;
    readonly fingerprintValue: string;
    readonly maskedHint: string;
  }) => Promise<boolean>;
  readonly handleDestroy: () => Promise<void>;
}

function createSettingsHandlers(
  props: AgentSettingsFormProps,
  updateState: (patch: Partial<SettingsState>) => void,
  router: ReturnType<typeof useRouter>
): SettingsHandlers {
  const handleSaveConfig = async (configJson: string) => {
    updateState({ error: undefined, success: undefined });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      updateState({ error: 'Config must be valid JSON.' });
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

  const handleSaveNewReference = async (result: {
    readonly referenceValue: string;
    readonly keyId: string;
    readonly fingerprintValue: string;
    readonly maskedHint: string;
  }) => {
    updateState({ pending: true });
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

  const handleDestroy = async () => {
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
  readonly onSaveConfig: (configJson: string) => Promise<boolean>;
  readonly onRotate: () => Promise<{ readonly generation: number } | undefined>;
  readonly onSaveNewReference: (result: {
    readonly referenceValue: string;
    readonly keyId: string;
    readonly fingerprintValue: string;
    readonly maskedHint: string;
  }) => Promise<boolean>;
  readonly onOpenDestroyDialog: () => void;
  readonly onDestroyConfirmTextChange: (value: string) => void;
  readonly onConfirmDestroy: () => Promise<void>;
  readonly onCancelDestroy: () => void;
}

/**
 * Render the settings page content.
 *
 * Split from `AgentSettingsForm` to stay within the `max-lines-per-function`
 * lint limit while preserving the wireframe §6.4 layout.
 */
function SettingsContent({
  agentId,
  displayName,
  initialConfig,
  currentCredential,
  actingOperatorId,
  initialNotice,
  state,
  onSaveConfig,
  onRotate,
  onSaveNewReference,
  onOpenDestroyDialog,
  onDestroyConfirmTextChange,
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
        confirmDisabled={state.destroyConfirmText !== agentId}
      >
        <p>
          This disables all mutating Agent operations. History is preserved. This action is
          irreversible.
        </p>
        <FormField
          id="destroyConfirm"
          label={`Type the Agent ID "${agentId}" to confirm`}
          value={state.destroyConfirmText}
          onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            onDestroyConfirmTextChange(event.currentTarget.value);
          }}
          disabled={state.pending}
          autoComplete="off"
        />
      </ConfirmDialog>
    </>
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
      <button
        type="button"
        className="nav-link state-error"
        onClick={onOpenDestroyDialog}
        disabled={pending}
        aria-disabled={pending}
      >
        Destroy Agent
      </button>
    </section>
  );
}
