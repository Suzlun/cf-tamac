import type { ThreadKeyIdentity } from '../threads';

/**
 * Minimal event acceptance input for the Agent foundation.
 */
export interface EventAcceptanceInput {
  readonly identity: ThreadKeyIdentity;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly payloadRef?: string;
}

/**
 * Event storage status values used before full mailbox processing exists.
 */
export const eventStorageStatuses = ['accepted', 'replayed'] as const;

/**
 * Event storage status value.
 */
export type EventStorageStatus = (typeof eventStorageStatuses)[number];
