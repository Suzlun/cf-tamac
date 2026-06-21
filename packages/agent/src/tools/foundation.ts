/**
 * Tool invocation foundation status values.
 */
export const toolInvocationStatuses = [
  'proposed',
  'pending_approval',
  'approved',
  'rejected',
] as const;

/**
 * Tool invocation status value.
 */
export type ToolInvocationStatus = (typeof toolInvocationStatuses)[number];
