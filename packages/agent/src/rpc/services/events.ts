import { type AgentEventService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent event service foundation; unimplemented methods fail closed by router default.
 */
export const agentEventService = {} satisfies Partial<ServiceImpl<typeof AgentEventService>>;
