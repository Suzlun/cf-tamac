import { createAgentArchiveRepository } from './archive-repository';
import { createAgentAuditRepository } from './audit-repository';
import { createAgentCompactionsRepository } from './compactions-repository';
import { createAgentConfigRepository } from './config-repository';
import { createAgentCredentialsRepository } from './credentials-repository';
import { createAgentStorageDatabase } from './database';
import { createAgentEventsRepository } from './events-repository';
import { createAgentGrantsRepository } from './grants-repository';
import { createAgentHistoryRepository } from './history-repository';
import { createAgentIdempotencyRepository } from './idempotency-repository';
import { createAgentIntegrationsRepository } from './integrations-repository';
import { createAgentMemoryRepository } from './memory-repository';
import { createAgentPendingRunsRepository } from './pending-runs-repository';
import { createAgentPrincipalsRepository } from './principals-repository';
import { createAgentProfileRepository } from './profile-repository';
import { createAgentRequestNoncesRepository } from './request-nonces-repository';
import { createAgentRuntimeRepository } from './runtime-repository';
import { createAgentSchedulerWakeRepository } from './scheduler-wake-repository';
import { createAgentSchedulesRepository } from './schedules-repository';
import { createAgentSectionsRepository } from './sections-repository';
import { ensureAgentFoundationTables } from './table-initializer';
import { createAgentThreadsRepository } from './threads-repository';
import { createAgentToolsRepository } from './tools-repository';

import type { AgentArchiveRepository } from './archive-repository';
import type { AgentAuditRepository } from './audit-repository';
import type { AgentCompactionsRepository } from './compactions-repository';
import type { AgentConfigRepository } from './config-repository';
import type { AgentCredentialsRepository } from './credentials-repository';
import type { AgentStorageDatabase } from './database';
import type { AgentEventsRepository } from './events-repository';
import type { AgentGrantsRepository } from './grants-repository';
import type { AgentHistoryRepository } from './history-repository';
import type { AgentIdempotencyRepository } from './idempotency-repository';
import type { AgentIntegrationsRepository } from './integrations-repository';
import type { AgentMemoryRepository } from './memory-repository';
import type { AgentPendingRunsRepository } from './pending-runs-repository';
import type { AgentPrincipalsRepository } from './principals-repository';
import type { AgentProfileRepository } from './profile-repository';
import type { AgentRequestNoncesRepository } from './request-nonces-repository';
import type { AgentRuntimeRepository } from './runtime-repository';
import type { AgentSchedulerWakeRepository } from './scheduler-wake-repository';
import type { AgentSchedulesRepository } from './schedules-repository';
import type { AgentSectionsRepository } from './sections-repository';
import type { AgentThreadsRepository } from './threads-repository';
import type { AgentToolsRepository } from './tools-repository';

/**
 * Repository set owned by one AIAgent Durable Object instance.
 */
export interface AgentStorageRepositories {
  readonly archives: AgentArchiveRepository;
  readonly audit: AgentAuditRepository;
  readonly compactions: AgentCompactionsRepository;
  readonly config: AgentConfigRepository;
  readonly credentials: AgentCredentialsRepository;
  readonly events: AgentEventsRepository;
  readonly grants: AgentGrantsRepository;
  readonly history: AgentHistoryRepository;
  readonly idempotency: AgentIdempotencyRepository;
  readonly integrations: AgentIntegrationsRepository;
  readonly memory: AgentMemoryRepository;
  readonly pendingRuns: AgentPendingRunsRepository;
  readonly principals: AgentPrincipalsRepository;
  readonly profile: AgentProfileRepository;
  readonly requestNonces: AgentRequestNoncesRepository;
  readonly runtime: AgentRuntimeRepository;
  readonly schedules: AgentSchedulesRepository;
  readonly schedulerWakes: AgentSchedulerWakeRepository;
  readonly sections: AgentSectionsRepository;
  readonly threads: AgentThreadsRepository;
  readonly tools: AgentToolsRepository;
  transaction<T>(operation: (repositories: AgentStorageRepositories) => T): T;
}

/**
 * Create the Stage 2 repository set for one Agent aggregate.
 */
export function createAgentStorageRepositories(
  agentId: string,
  storage: DurableObjectStorage
): AgentStorageRepositories {
  const database = createAgentStorageDatabase(storage);
  ensureAgentFoundationTables(database);
  return createAgentStorageRepositorySet(agentId, database);
}

function createAgentStorageRepositorySet(
  agentId: string,
  database: AgentStorageDatabase
): AgentStorageRepositories {
  return {
    archives: createAgentArchiveRepository(agentId, database),
    audit: createAgentAuditRepository(agentId, database),
    compactions: createAgentCompactionsRepository(agentId, database),
    config: createAgentConfigRepository(agentId, database),
    credentials: createAgentCredentialsRepository(agentId, database),
    events: createAgentEventsRepository(agentId, database),
    grants: createAgentGrantsRepository(agentId, database),
    history: createAgentHistoryRepository(agentId, database),
    idempotency: createAgentIdempotencyRepository(agentId, database),
    integrations: createAgentIntegrationsRepository(agentId, database),
    memory: createAgentMemoryRepository(agentId, database),
    pendingRuns: createAgentPendingRunsRepository(agentId, database),
    principals: createAgentPrincipalsRepository(agentId, database),
    profile: createAgentProfileRepository(agentId, database),
    requestNonces: createAgentRequestNoncesRepository(agentId, database),
    runtime: createAgentRuntimeRepository(agentId, database),
    schedules: createAgentSchedulesRepository(agentId, database),
    schedulerWakes: createAgentSchedulerWakeRepository(agentId, database),
    sections: createAgentSectionsRepository(agentId, database),
    threads: createAgentThreadsRepository(agentId, database),
    tools: createAgentToolsRepository(agentId, database),
    transaction: (operation) =>
      database.transaction((transactionDatabase) =>
        operation(
          createAgentStorageRepositorySet(agentId, transactionDatabase as AgentStorageDatabase)
        )
      ),
  };
}
