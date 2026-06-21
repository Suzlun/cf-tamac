import { type AgentThreadService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent thread service foundation; unimplemented methods fail closed by router default.
 */
export const agentThreadService = {} satisfies Partial<ServiceImpl<typeof AgentThreadService>>;
