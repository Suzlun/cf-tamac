import { type AgentThreadService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchGetLatestCompaction,
  dispatchGetThread,
  dispatchGetThreadMemory,
  dispatchListSections,
  dispatchListThreads,
  dispatchSearchThreadHistory,
} from '../do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Create the implemented Agent Thread query service for the Agent Connect facade.
 */
export function createAgentThreadService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentThreadService>> {
  return {
    getLatestCompaction(request) {
      return dispatchGetLatestCompaction(env, request);
    },
    getThread(request) {
      return dispatchGetThread(env, request);
    },
    getThreadMemory(request) {
      return dispatchGetThreadMemory(env, request);
    },
    listSections(request) {
      return dispatchListSections(env, request);
    },
    listThreads(request) {
      return dispatchListThreads(env, request);
    },
    searchThreadHistory(request) {
      return dispatchSearchThreadHistory(env, request);
    },
  };
}
