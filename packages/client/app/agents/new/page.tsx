import {
  getManagedAgentForEdit,
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

  return (
    <AgentRegistrationForm
      initialAgent={initial?.agent}
      initialCredential={initial?.credential}
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
    />
  );
}
