/**
 * Adapter connection foundation status values.
 */
export const adapterConnectionStatuses = ['active', 'disabled', 'deleted'] as const;

/**
 * Adapter connection status value.
 */
export type AdapterConnectionStatus = (typeof adapterConnectionStatuses)[number];
