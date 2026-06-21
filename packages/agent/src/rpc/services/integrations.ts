import { type AgentIntegrationService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent integration service foundation; unimplemented methods fail closed by router default.
 */
export const agentIntegrationService = {} satisfies Partial<
  ServiceImpl<typeof AgentIntegrationService>
>;
