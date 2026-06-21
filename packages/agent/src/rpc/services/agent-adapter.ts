import { type IntegrationIngressService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Integration ingress service foundation; unimplemented methods fail closed by router default.
 */
export const integrationIngressService = {} satisfies Partial<
  ServiceImpl<typeof IntegrationIngressService>
>;
