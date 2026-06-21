/**
 * Schedule foundation status values.
 */
export const scheduleStatuses = ['active', 'cancelled'] as const;

/**
 * Schedule status value.
 */
export type ScheduleStatus = (typeof scheduleStatuses)[number];
