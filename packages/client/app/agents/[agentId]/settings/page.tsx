import { verifyAgentHealth } from '@cf-tamac/client/server/actions/agent-health';
import {
  destroyAgent,
  getAgentConfig,
  getAgentOverview,
  rotateAgentCredential,
  updateAgentConfig,
} from '@cf-tamac/client/server/actions/agent-lifecycle';
import { saveDefaultModelPolicy } from '@cf-tamac/client/server/actions/agent-operations';
import {
  getActingOperatorId,
  getManagedAgentForEdit,
  saveAgentAccessLookup,
  saveManagedAgentSigningKey,
} from '@cf-tamac/client/server/actions/managed-agents';
import {
  getDefaultModelPolicyForManagedAgent,
  validateModelPolicyForManagedAgent,
} from '@cf-tamac/client/server/actions/model-policies';
import { listSigningKeys } from '@cf-tamac/client/server/actions/signing-keys';

import { AgentSettingsForm } from '../../../../src/components/agent-settings-form';
import { AgentSigningKeySelect } from '../../../../src/components/agent-signing-key-select';
import { ControlRoomFrame } from '../../../../src/components/control-room-frame';
import { ErrorAlert } from '../../../../src/components/error-alert';

interface AgentSettingsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
}

interface SettingsCredentialReferenceInput {
  readonly agentId: string;
  readonly referenceValue: string;
  readonly keyId: string;
  readonly fingerprintValue: string;
  readonly maskedHint: string;
  readonly status: string;
}

async function saveSettingsCredentialReference(
  input: SettingsCredentialReferenceInput
): Promise<unknown> {
  'use server';

  return saveAgentAccessLookup({
    agentId: input.agentId,
    referenceValue: input.referenceValue,
    keyId: input.keyId,
    publicFingerprint: input.fingerprintValue,
    maskedHint: input.maskedHint,
    status: input.status,
  });
}

function getErrorCategory(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('category' in error)) {
    return undefined;
  }
  const category = (error as { readonly category?: unknown }).category;
  return typeof category === 'string' ? category : undefined;
}

function safeSettingsErrorMessage(error: unknown): string {
  switch (getErrorCategory(error)) {
    case 'permission_denied':
      return 'You do not have permission to view Agent settings.';
    case 'not_found':
      return 'The Agent Worker has no aggregate for this Agent ID. Verify the Agent ID and RPC origin before editing settings.';
    case 'unavailable':
      return 'Agent settings are temporarily unavailable. Please retry.';
    default:
      return 'Agent settings are temporarily unavailable. Please retry.';
  }
}

/**
 * Agent settings page (AGENT-MANAGEMENT-UI-S004).
 *
 * Supports config update, credential rotation, and Agent destruction through
 * Server Actions that carry acting user context.
 */
export default async function AgentSettingsPage({ params }: AgentSettingsPageProps) {
  const { agentId } = await params;
  const managedAgent = await getManagedAgentForEdit(agentId);

  if (managedAgent.agent === undefined) {
    return (
      <SettingsErrorFrame
        agentId={agentId}
        message="This Agent is not registered in the Client ledger."
      />
    );
  }

  // signing key selection と Health Check は Client D1 だけで完結し、Agent RPC 不要。
  // Agent RPC config 取得が signing key 未選択で fail-closed しても、選択 UI へ到達できるように分離する。
  const signingKeys = await listSigningKeys();

  const [configResult, overviewResult, policyResult] = await Promise.allSettled([
    getAgentConfig(agentId),
    getAgentOverview(agentId),
    getDefaultModelPolicyForManagedAgent(agentId),
  ]);

  const actingOperatorId = await getActingOperatorId();
  const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : undefined;
  const defaultPolicy =
    policyResult.status === 'fulfilled' ? policyResult.value.metadata : undefined;
  // config / overview / policy のいずれかが signing key 未選択等で失敗しても、
  // signing key select + Health Check は表示できるように notice に変換する。
  const agentRpcNotice =
    configResult.status === 'rejected'
      ? safeSettingsErrorMessage(configResult.reason)
      : overviewResult.status === 'rejected'
        ? safeSettingsErrorMessage(overviewResult.reason)
        : policyResult.status === 'rejected'
          ? safeSettingsErrorMessage(policyResult.reason)
          : undefined;
  const currentCredential = {
    generation: overview?.credential?.generation ?? overview?.credentialGeneration,
    status: overview?.credential?.status ?? managedAgent.credential?.status ?? 'unknown',
    keyId: overview?.credential?.keyId ?? managedAgent.credential?.keyId,
    maskedHint: managedAgent.credential?.maskedHint,
  };

  return (
    <div className="space-y-8">
      {configResult.status === 'fulfilled' ? (
        <AgentSettingsForm
          agentId={agentId}
          displayName={managedAgent.agent.displayName}
          initialConfig={configResult.value}
          initialModelPolicy={defaultPolicy}
          currentCredential={currentCredential}
          actingOperatorId={actingOperatorId}
          initialNotice={agentRpcNotice}
          onUpdateConfig={updateAgentConfig}
          onValidateModelPolicy={validateModelPolicyForManagedAgent}
          onSaveDefaultModelPolicy={saveDefaultModelPolicy}
          onRotateCredential={rotateAgentCredential}
          onSaveAccessLookup={saveSettingsCredentialReference}
          onDestroy={destroyAgent}
        />
      ) : (
        <ControlRoomFrame title={`Agent registry › ${agentId}`} signalLabel="settings unavailable">
          <ErrorAlert message={agentRpcNotice ?? 'Agent settings are temporarily unavailable.'} />
        </ControlRoomFrame>
      )}
      <AgentSigningKeySelect
        agentId={agentId}
        signingKeys={signingKeys}
        selectedIssuer={managedAgent.agent.signingIssuer}
        selectedKeyId={managedAgent.agent.signingKeyId}
        selectedPublicFingerprint={managedAgent.agent.signingPublicFingerprint}
        lastVerifiedAtMs={managedAgent.agent.signingLastVerifiedAtMs}
        saveSelectionAction={saveManagedAgentSigningKey}
        runHealthCheckAction={verifyAgentHealth}
      />
    </div>
  );
}

function SettingsErrorFrame({
  agentId,
  message,
}: {
  readonly agentId: string;
  readonly message: string;
}) {
  return (
    <ControlRoomFrame title={`Agent registry › ${agentId}`} signalLabel="settings unavailable">
      <ErrorAlert message={message} />
    </ControlRoomFrame>
  );
}
