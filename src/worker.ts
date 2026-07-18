import { handleAgentConnectRequest } from './rpc/connect-worker-adapter';

import type { AgentWorkerEnv } from './env';

/**
 * Initial Agent Worker handler; RPC routing is attached by the Connect facade tasks.
 */
const agentWorker: ExportedHandler<AgentWorkerEnv> = {
  fetch(request, env) {
    return handleAgentConnectRequest(request, env);
  },
};

/**
 * Cloudflare Worker default export for the Agent Service.
 */
export default agentWorker;
