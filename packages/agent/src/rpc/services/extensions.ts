import { type AgentExtensionService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent extension service foundation; unimplemented methods fail closed by router default.
 */
export const agentExtensionService = {} satisfies Partial<
  ServiceImpl<typeof AgentExtensionService>
>;
