/**
 * Compaction foundation status values.
 */
export const compactionStatuses = ['pending', 'running', 'ready', 'failed'] as const;

/**
 * Compaction status value.
 */
export type CompactionStatus = (typeof compactionStatuses)[number];
