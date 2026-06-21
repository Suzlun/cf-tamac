import { type ExtensionIngressService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Extension ingress service foundation; unimplemented methods fail closed by router default.
 */
export const extensionIngressService = {} satisfies Partial<
  ServiceImpl<typeof ExtensionIngressService>
>;
