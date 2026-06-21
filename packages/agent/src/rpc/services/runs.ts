import { type AgentRunService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent run service foundation; unimplemented methods fail closed by router default.
 */
export const agentRunService = {} satisfies Partial<ServiceImpl<typeof AgentRunService>>;
