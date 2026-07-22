import {
  getManagedAgentForEdit,
  reconcileManagedAgentRegistration,
  submitManagedAgentRegistration,
  validateManagedAgentRegistrationModelPolicy,
} from '@cf-tamac/client/server/actions/managed-agents';

import { AgentRegistrationForm } from '../../../src/components/agent-registration-form';

interface NewAgentPageProps {
  readonly searchParams: Promise<{ readonly edit?: string }>;
}

/**
 * Add or edit managed Agent registration page (AGENT-MANAGEMENT-UI-S002).
 */
export default async function NewAgentPage({ searchParams }: NewAgentPageProps) {
  const { edit } = await searchParams;
  const editAgentId = edit ?? '';
  const initial = editAgentId === '' ? undefined : await getManagedAgentForEdit(editAgentId);
  // RSC serialization に server-only attempt key/digest を含めないため、edit form が必要とする Client-owned 表示値だけを明示投影する。
  const initialAgent =
    initial?.agent === undefined
      ? undefined
      : {
          agentId: initial.agent.agentId,
          agentRpcOrigin: initial.agent.agentRpcOrigin,
          displayName: initial.agent.displayName,
          displayOrder: initial.agent.displayOrder,
        };
  // credential lookup reference や fingerprint を Browser payload へ戻さず、edit 時に再表示可能な安全 metadata だけを渡す。
  const initialCredential =
    initial?.credential === undefined
      ? undefined
      : {
          keyId: initial.credential.keyId,
          maskedHint: initial.credential.maskedHint,
          status: initial.credential.status,
        };

  return (
    <AgentRegistrationForm
      initialAgent={initialAgent}
      initialCredential={initialCredential}
      onSubmit={async (values) => {
        'use server';
        return submitManagedAgentRegistration(
          values,
          editAgentId === '' ? {} : { existingAgentId: editAgentId }
        );
      }}
      onValidateModelPolicy={async (values) => {
        'use server';
        return validateManagedAgentRegistrationModelPolicy(values);
      }}
      onReconcileRegistration={async (agentId) => {
        'use server';
        // Browser は attempt key/digest を保持せず、Agent ID だけで server-only ledger の同一 registration context を照合する。
        return reconcileManagedAgentRegistration(agentId);
      }}
    />
  );
}
