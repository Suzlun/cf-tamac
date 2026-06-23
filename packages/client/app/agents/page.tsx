import {
  listManagedAgentsWithCredentialStatus,
  markManagedAgentOpened,
  setManagedAgentPinned,
} from '@cf-tamac/client/server/actions/managed-agents';

import { AgentList } from '../../src/components/agent-list';

export const dynamic = 'force-dynamic';

/**
 * Agent registry list page (CLIENT-MANAGEMENT-S001).
 *
 * Reads managed Agent metadata and credential status from Client D1 and
 * delegates interactive pin/order handling to a client component.
 */
export default async function AgentsPage() {
  const agents = await listManagedAgentsWithCredentialStatus();

  return (
    <AgentList agents={agents} onPin={setManagedAgentPinned} onOpen={markManagedAgentOpened} />
  );
}
