import { type AgentToolService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent tool service foundation; unimplemented methods fail closed by router default.
 */
export const agentToolService = {} satisfies Partial<ServiceImpl<typeof AgentToolService>>;
