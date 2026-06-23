import type {
  CancelRunRequest,
  CancelRunResponseSchema,
  GetRunRequest,
  GetRunResponseSchema,
  ListRunsRequest,
  ListRunsResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../agent-routing';

import { createAgentCoreContext } from './command-context';
import { requireAgentId, toNumber } from './message-mappers';
import {
  mapCancelRunResponse,
  mapGetRunResponse,
  mapListRunsResponse,
} from './run-message-mappers';

import type { AgentWorkerEnv } from '../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type GetRunResponseInit = MessageInitShape<typeof GetRunResponseSchema>;
type ListRunsResponseInit = MessageInitShape<typeof ListRunsResponseSchema>;
type CancelRunResponseInit = MessageInitShape<typeof CancelRunResponseSchema>;

/**
 * Dispatch GetRun to the Agent-owned Durable Object.
 */
export async function dispatchGetRun(
  env: AgentWorkerEnv,
  request: GetRunRequest
): Promise<GetRunResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetRun',
    service: 'cftamac.agent.v1.AgentRunService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getRun({
    context,
    runId: request.runId,
  });
  return mapGetRunResponse(result);
}

/**
 * Dispatch ListRuns to the Agent-owned Durable Object.
 */
export async function dispatchListRuns(
  env: AgentWorkerEnv,
  request: ListRunsRequest
): Promise<ListRunsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListRuns',
    service: 'cftamac.agent.v1.AgentRunService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listRuns({
    context,
    endMs: toNumber(request.timeRange?.endUnixMs),
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    startMs: toNumber(request.timeRange?.startUnixMs),
    status: request.status,
    threadId: request.threadId,
  });
  return mapListRunsResponse(result);
}

/**
 * Dispatch CancelRun to the Agent-owned Durable Object.
 */
export async function dispatchCancelRun(
  env: AgentWorkerEnv,
  request: CancelRunRequest
): Promise<CancelRunResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'CancelRun',
    security: request.security,
    service: 'cftamac.agent.v1.AgentRunService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).cancelRun({
    context,
    reason: request.reason,
    runId: request.runId,
  });
  return mapCancelRunResponse(result);
}
