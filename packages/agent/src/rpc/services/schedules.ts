import { type AgentScheduleService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent schedule service foundation; unimplemented methods fail closed by router default.
 */
export const agentScheduleService = {} satisfies Partial<ServiceImpl<typeof AgentScheduleService>>;
