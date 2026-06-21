import { type AgentLifecycleService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent lifecycle service foundation; unimplemented methods fail closed by router default.
 */
export const agentLifecycleService = {} satisfies Partial<
  ServiceImpl<typeof AgentLifecycleService>
>;
