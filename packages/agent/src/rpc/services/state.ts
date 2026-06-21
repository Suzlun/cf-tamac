import { type AgentStateService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent state service foundation; unimplemented methods fail closed by router default.
 */
export const agentStateService = {} satisfies Partial<ServiceImpl<typeof AgentStateService>>;
