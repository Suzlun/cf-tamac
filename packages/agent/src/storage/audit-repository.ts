import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Input for recording an Agent-local audit event.
 */
export interface InsertAgentAuditEventInput {
  readonly auditId: string;
  readonly eventType: string;
  readonly principalRef?: string;
  readonly requestDigest?: string;
  readonly createdAtMs: number;
}

/**
 * Repository for Agent-local audit event records.
 */
export interface AgentAuditRepository {
  readonly tableName: 'agent_audit_events';
  insertAuditEvent(input: InsertAgentAuditEventInput): void;
}

/**
 * Create a repository for Agent-local audit event records.
 */
export function createAgentAuditRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentAuditRepository {
  const table = agentStorageDrizzleSchema.agentAuditEvents;
  return {
    tableName: 'agent_audit_events',
    insertAuditEvent(input) {
      database
        .insert(table)
        .values({
          agentId,
          auditId: input.auditId,
          createdAtMs: input.createdAtMs,
          eventType: input.eventType,
          principalRef: input.principalRef ?? null,
          requestDigest: input.requestDigest ?? null,
        })
        .run();
    },
  };
}
