import { and, asc, eq, gt } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';
import type {
  AgentAdapterConnectionRow,
  AgentAdapterDeliveryRow,
  AgentDeliveryContextRow,
  AgentInstallationTrustKeyRow,
  AgentIntegrationAdapterRow,
  AgentIntegrationDefinitionRow,
  AgentIntegrationGrantRow,
  AgentIntegrationInstallationRow,
  AgentIntegrationsRepository,
  CreateAgentAdapterConnectionInput,
  CreateAgentAdapterDeliveryInput,
  CreateAgentDeliveryContextInput,
  DisableInstallationOwnedRowsInput,
  InsertAgentInstallationTrustKeyInput,
  InsertAgentIntegrationGrantInput,
  InsertAgentIntegrationInstallationInput,
  ListAgentAdapterConnectionsInput,
  ListAgentInstallationsInput,
  RevokeInstallationRowsInput,
  UpdateAgentAdapterConnectionStatusInput,
  UpdateAgentAdapterDeliveryStatusInput,
  UpdateAgentIntegrationInstallationStatusInput,
  UpsertAgentIntegrationAdapterInput,
  UpsertAgentIntegrationDefinitionInput,
} from './integrations-repository-types';

export type {
  AgentAdapterConnectionRow,
  AgentAdapterDeliveryRow,
  AgentDeliveryContextRow,
  AgentInstallationTrustKeyRow,
  AgentIntegrationAdapterRow,
  AgentIntegrationDefinitionRow,
  AgentIntegrationGrantRow,
  AgentIntegrationInstallationRow,
  AgentIntegrationsRepository,
} from './integrations-repository-types';

/**
 * 一つの AIAgent Durable Object に閉じた Integration repository を作成します。
 *
 * @param agentId Durable Object identity と一致する Agent ID です。
 * @param database Agent-owned Durable SQLite database です。
 * @returns Installation、Adapter Connection、DeliveryContext、AdapterDelivery を扱う repository です。
 */
export function createAgentIntegrationsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentIntegrationsRepository {
  return {
    adapterConnectionTableName: 'agent_adapter_connections',
    adapterDefinitionTableName: 'agent_integration_adapters',
    adapterDeliveryTableName: 'agent_adapter_deliveries',
    deliveryContextTableName: 'agent_delivery_contexts',
    definitionTableName: 'agent_integration_definitions',
    grantTableName: 'agent_integration_grants',
    installationTableName: 'agent_integration_installations',
    trustKeyTableName: 'agent_installation_trust_keys',
    createAdapterConnection: (input) => createAdapterConnection(agentId, database, input),
    createAdapterDelivery: (input) => createAdapterDelivery(agentId, database, input),
    createDeliveryContext: (input) => createDeliveryContext(agentId, database, input),
    disableAdapterConnectionsByInstallation: (input) =>
      disableAdapterConnectionsByInstallation(agentId, database, input),
    findActiveTrustKey: (input) => findActiveTrustKey(agentId, database, input),
    findAdapterDefinition: (input) => findAdapterDefinition(agentId, database, input),
    findConnection: (connectionId) => findConnection(agentId, database, connectionId),
    findDefinition: (integrationId) => findDefinition(agentId, database, integrationId),
    findDelivery: (deliveryId) => findDelivery(agentId, database, deliveryId),
    findDeliveryContext: (deliveryContextId) =>
      findDeliveryContext(agentId, database, deliveryContextId),
    findInstallation: (installationId) => findInstallation(agentId, database, installationId),
    insertGrant: (input) => insertGrant(agentId, database, input),
    insertInstallation: (input) => insertInstallation(agentId, database, input),
    insertTrustKey: (input) => insertTrustKey(agentId, database, input),
    listConnections: (input) => listConnections(agentId, database, input),
    listGrants: (installationId) => listGrants(agentId, database, installationId),
    listInstallations: (input) => listInstallations(agentId, database, input),
    revokeDeliveryContextsByInstallation: (input) =>
      revokeDeliveryContextsByInstallation(agentId, database, input),
    revokeGrantsByInstallation: (input) => revokeGrantsByInstallation(agentId, database, input),
    revokeTrustKeysByInstallation: (input) =>
      revokeTrustKeysByInstallation(agentId, database, input),
    updateConnectionStatus: (input) => updateConnectionStatus(agentId, database, input),
    updateDeliveryStatus: (input) => updateDeliveryStatus(agentId, database, input),
    updateInstallationStatus: (input) => updateInstallationStatus(agentId, database, input),
    upsertAdapterDefinition: (input) => upsertAdapterDefinition(agentId, database, input),
    upsertDefinition: (input) => upsertDefinition(agentId, database, input),
  };
}

function insertInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentIntegrationInstallationInput
): AgentIntegrationInstallationRow {
  const table = agentStorageDrizzleSchema.agentIntegrationInstallations;
  database.insert(table).values(toInstallationValues(agentId, input)).run();
  return requireInstallation(agentId, database, input.installationId);
}

function updateInstallationStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpdateAgentIntegrationInstallationStatusInput
): AgentIntegrationInstallationRow {
  const table = agentStorageDrizzleSchema.agentIntegrationInstallations;
  database
    .update(table)
    .set(toInstallationUpdateValues(input))
    .where(and(eq(table.agentId, agentId), eq(table.installationId, input.installationId)))
    .run();
  return requireInstallation(agentId, database, input.installationId);
}

function findInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  installationId: string
): AgentIntegrationInstallationRow | undefined {
  const table = agentStorageDrizzleSchema.agentIntegrationInstallations;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.installationId, installationId)))
    .limit(1)
    .get();
}

function listInstallations(
  agentId: string,
  database: AgentStorageDatabase,
  input: ListAgentInstallationsInput
): AgentIntegrationInstallationRow[] {
  const table = agentStorageDrizzleSchema.agentIntegrationInstallations;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        input.status === undefined ? undefined : eq(table.status, input.status),
        input.afterUpdatedAtMs === undefined
          ? undefined
          : gt(table.updatedAtMs, input.afterUpdatedAtMs)
      )
    )
    .orderBy(asc(table.updatedAtMs), asc(table.installationId))
    .limit(input.limit)
    .all();
}

function upsertDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpsertAgentIntegrationDefinitionInput
): AgentIntegrationDefinitionRow {
  const table = agentStorageDrizzleSchema.agentIntegrationDefinitions;
  database
    .insert(table)
    .values({ agentId, ...input, manifestRef: input.manifestRef ?? null })
    .onConflictDoUpdate({
      set: { ...input, manifestRef: input.manifestRef ?? null },
      target: [table.agentId, table.integrationId],
    })
    .run();
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.integrationId, input.integrationId)))
    .limit(1)
    .get() as AgentIntegrationDefinitionRow;
}

function findDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  integrationId: string
): AgentIntegrationDefinitionRow | undefined {
  const table = agentStorageDrizzleSchema.agentIntegrationDefinitions;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.integrationId, integrationId)))
    .limit(1)
    .get();
}

function insertGrant(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentIntegrationGrantInput
): AgentIntegrationGrantRow {
  const table = agentStorageDrizzleSchema.agentIntegrationGrants;
  database
    .insert(table)
    .values({ agentId, ...input })
    .run();
  const grant = listGrants(agentId, database, input.installationId).find(
    (row) => row.grantId === input.grantId
  );
  if (grant === undefined) {
    throw new TypeError('Inserted Integration grant was not found.');
  }
  return grant;
}

function listGrants(
  agentId: string,
  database: AgentStorageDatabase,
  installationId: string
): AgentIntegrationGrantRow[] {
  const table = agentStorageDrizzleSchema.agentIntegrationGrants;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.installationId, installationId)))
    .orderBy(asc(table.createdAtMs), asc(table.grantId))
    .all();
}

function insertTrustKey(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentInstallationTrustKeyInput
): AgentInstallationTrustKeyRow {
  const table = agentStorageDrizzleSchema.agentInstallationTrustKeys;
  database
    .insert(table)
    .values({
      agentId,
      ...input,
      publicKeyMaterial: input.publicKeyMaterial ?? null,
      revokedAtMs: null,
    })
    .run();
  return requireTrustKey(agentId, database, input.trustKeyId);
}

function findActiveTrustKey(
  agentId: string,
  database: AgentStorageDatabase,
  input: { readonly installationId: string; readonly keyId: string }
): AgentInstallationTrustKeyRow | undefined {
  const table = agentStorageDrizzleSchema.agentInstallationTrustKeys;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.installationId, input.installationId),
        eq(table.keyId, input.keyId),
        eq(table.status, 'active')
      )
    )
    .limit(1)
    .get();
}

function upsertAdapterDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpsertAgentIntegrationAdapterInput
): AgentIntegrationAdapterRow {
  const table = agentStorageDrizzleSchema.agentIntegrationAdapters;
  const values = {
    agentId,
    ...input,
    allowedModelPolicyRefs: serializePolicyRefList(input.allowedModelPolicyRefs),
    deliveryCapabilityId: input.deliveryCapabilityId ?? null,
    modelPolicyGrantRef: input.modelPolicyGrantRef ?? null,
    schemaRef: input.schemaRef ?? null,
  };
  database
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      set: values,
      target: [table.agentId, table.installationId, table.adapterId],
    })
    .run();
  return requireAdapterDefinition(agentId, database, input.installationId, input.adapterId);
}

function findAdapterDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  input: { readonly adapterId: string; readonly installationId: string }
): AgentIntegrationAdapterRow | undefined {
  const table = agentStorageDrizzleSchema.agentIntegrationAdapters;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.installationId, input.installationId),
        eq(table.adapterId, input.adapterId)
      )
    )
    .limit(1)
    .get();
}

function createAdapterConnection(
  agentId: string,
  database: AgentStorageDatabase,
  input: CreateAgentAdapterConnectionInput
): AgentAdapterConnectionRow {
  const table = agentStorageDrizzleSchema.agentAdapterConnections;
  database.insert(table).values(toConnectionValues(agentId, input)).run();
  return requireConnection(agentId, database, input.connectionId);
}

function findConnection(
  agentId: string,
  database: AgentStorageDatabase,
  connectionId: string
): AgentAdapterConnectionRow | undefined {
  const table = agentStorageDrizzleSchema.agentAdapterConnections;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.connectionId, connectionId)))
    .limit(1)
    .get();
}

function listConnections(
  agentId: string,
  database: AgentStorageDatabase,
  input: ListAgentAdapterConnectionsInput
): AgentAdapterConnectionRow[] {
  const table = agentStorageDrizzleSchema.agentAdapterConnections;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        input.installationId === undefined
          ? undefined
          : eq(table.installationId, input.installationId),
        input.adapterId === undefined ? undefined : eq(table.adapterId, input.adapterId),
        input.status === undefined ? undefined : eq(table.status, input.status),
        input.afterCreatedAtMs === undefined
          ? undefined
          : gt(table.createdAtMs, input.afterCreatedAtMs)
      )
    )
    .orderBy(asc(table.createdAtMs), asc(table.connectionId))
    .limit(input.limit)
    .all();
}

function updateConnectionStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpdateAgentAdapterConnectionStatusInput
): AgentAdapterConnectionRow {
  const table = agentStorageDrizzleSchema.agentAdapterConnections;
  database
    .update(table)
    .set({ disabledAtMs: input.disabledAtMs ?? null, status: input.status })
    .where(and(eq(table.agentId, agentId), eq(table.connectionId, input.connectionId)))
    .run();
  return requireConnection(agentId, database, input.connectionId);
}

function createDeliveryContext(
  agentId: string,
  database: AgentStorageDatabase,
  input: CreateAgentDeliveryContextInput
): AgentDeliveryContextRow {
  const table = agentStorageDrizzleSchema.agentDeliveryContexts;
  database
    .insert(table)
    .values({
      agentId,
      ...input,
      expiresAtMs: input.expiresAtMs ?? null,
      metadataRef: input.metadataRef ?? null,
      modelPolicyDigest: input.modelPolicyDigest ?? null,
      modelPolicyRef: input.modelPolicyRef ?? null,
    })
    .run();
  return requireDeliveryContext(agentId, database, input.deliveryContextId);
}

function findDeliveryContext(
  agentId: string,
  database: AgentStorageDatabase,
  deliveryContextId: string
): AgentDeliveryContextRow | undefined {
  const table = agentStorageDrizzleSchema.agentDeliveryContexts;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.deliveryContextId, deliveryContextId)))
    .limit(1)
    .get();
}

function createAdapterDelivery(
  agentId: string,
  database: AgentStorageDatabase,
  input: CreateAgentAdapterDeliveryInput
): AgentAdapterDeliveryRow {
  const table = agentStorageDrizzleSchema.agentAdapterDeliveries;
  database.insert(table).values(toDeliveryValues(agentId, input)).run();
  return requireDelivery(agentId, database, input.deliveryId);
}

function findDelivery(
  agentId: string,
  database: AgentStorageDatabase,
  deliveryId: string
): AgentAdapterDeliveryRow | undefined {
  const table = agentStorageDrizzleSchema.agentAdapterDeliveries;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.deliveryId, deliveryId)))
    .limit(1)
    .get();
}

function updateDeliveryStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpdateAgentAdapterDeliveryStatusInput
): AgentAdapterDeliveryRow {
  const table = agentStorageDrizzleSchema.agentAdapterDeliveries;
  database
    .update(table)
    .set({
      providerOperationId: input.providerOperationId ?? null,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(and(eq(table.agentId, agentId), eq(table.deliveryId, input.deliveryId)))
    .run();
  return requireDelivery(agentId, database, input.deliveryId);
}

function disableAdapterConnectionsByInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  input: DisableInstallationOwnedRowsInput
): AgentAdapterConnectionRow[] {
  const rows = listConnections(agentId, database, {
    installationId: input.installationId,
    limit: 1_000,
  });
  const activeRows = rows.filter((row) => row.status === 'active');
  for (const row of activeRows)
    updateConnectionStatus(agentId, database, {
      connectionId: row.connectionId,
      disabledAtMs: input.nowMs,
      status: input.status,
    });
  return activeRows.map((row) => requireConnection(agentId, database, row.connectionId));
}

function revokeDeliveryContextsByInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  input: DisableInstallationOwnedRowsInput
): AgentDeliveryContextRow[] {
  const table = agentStorageDrizzleSchema.agentDeliveryContexts;
  database
    .update(table)
    .set({ status: input.status })
    .where(and(eq(table.agentId, agentId), eq(table.installationId, input.installationId)))
    .run();
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.installationId, input.installationId),
        eq(table.status, input.status)
      )
    )
    .all();
}

function revokeGrantsByInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  input: RevokeInstallationRowsInput
): AgentIntegrationGrantRow[] {
  const table = agentStorageDrizzleSchema.agentIntegrationGrants;
  database
    .update(table)
    .set({ status: 'revoked' })
    .where(and(eq(table.agentId, agentId), eq(table.installationId, input.installationId)))
    .run();
  return listGrants(agentId, database, input.installationId).filter(
    (row) => row.status === 'revoked'
  );
}

function revokeTrustKeysByInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  input: RevokeInstallationRowsInput
): AgentInstallationTrustKeyRow[] {
  const table = agentStorageDrizzleSchema.agentInstallationTrustKeys;
  database
    .update(table)
    .set({ revokedAtMs: input.nowMs, status: 'revoked' })
    .where(and(eq(table.agentId, agentId), eq(table.installationId, input.installationId)))
    .run();
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.installationId, input.installationId),
        eq(table.status, 'revoked')
      )
    )
    .all();
}

function requireInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  installationId: string
) {
  const row = findInstallation(agentId, database, installationId);
  if (row === undefined) throw new Error('Integration Installation write failed.');
  return row;
}

function requireTrustKey(agentId: string, database: AgentStorageDatabase, trustKeyId: string) {
  const table = agentStorageDrizzleSchema.agentInstallationTrustKeys;
  const row = database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.trustKeyId, trustKeyId)))
    .limit(1)
    .get();
  if (row === undefined) throw new Error('Installation trust key write failed.');
  return row;
}

function requireAdapterDefinition(
  agentId: string,
  database: AgentStorageDatabase,
  installationId: string,
  adapterId: string
) {
  const row = findAdapterDefinition(agentId, database, { adapterId, installationId });
  if (row === undefined) throw new Error('Adapter definition write failed.');
  return row;
}

function requireConnection(agentId: string, database: AgentStorageDatabase, connectionId: string) {
  const row = findConnection(agentId, database, connectionId);
  if (row === undefined) throw new Error('Adapter Connection write failed.');
  return row;
}

function requireDeliveryContext(
  agentId: string,
  database: AgentStorageDatabase,
  deliveryContextId: string
) {
  const row = findDeliveryContext(agentId, database, deliveryContextId);
  if (row === undefined) throw new Error('DeliveryContext write failed.');
  return row;
}

function requireDelivery(agentId: string, database: AgentStorageDatabase, deliveryId: string) {
  const row = findDelivery(agentId, database, deliveryId);
  if (row === undefined) throw new Error('AdapterDelivery write failed.');
  return row;
}

function toInstallationValues(agentId: string, input: InsertAgentIntegrationInstallationInput) {
  return {
    agentId,
    ...input,
    allowedModelPolicyRefs: serializePolicyRefList(input.allowedModelPolicyRefs),
    grantSummaryRef: input.grantSummaryRef ?? null,
    installedAtMs: input.installedAtMs ?? null,
    manifestDigestSha256: input.manifestDigestSha256 ?? null,
    manifestRef: input.manifestRef ?? null,
    modelPolicyGrantRef: input.modelPolicyGrantRef ?? null,
    providerBaseUrl: input.providerBaseUrl ?? null,
    providerId: input.providerId ?? null,
    publicKeyRef: input.publicKeyRef ?? null,
    schemaVersion: input.schemaVersion ?? null,
    setupInstructionsRef: input.setupInstructionsRef ?? null,
    updatedAtMs: input.updatedAtMs ?? null,
  };
}

function toInstallationUpdateValues(input: UpdateAgentIntegrationInstallationStatusInput) {
  return {
    allowedModelPolicyRefs:
      input.allowedModelPolicyRefs === undefined
        ? undefined
        : serializePolicyRefList(input.allowedModelPolicyRefs),
    grantSummaryRef: input.grantSummaryRef,
    installedAtMs: input.installedAtMs,
    manifestDigestSha256: input.manifestDigestSha256,
    manifestRef: input.manifestRef,
    modelPolicyGrantRef: input.modelPolicyGrantRef,
    providerBaseUrl: input.providerBaseUrl,
    providerId: input.providerId,
    publicKeyRef: input.publicKeyRef,
    schemaVersion: input.schemaVersion,
    setupInstructionsRef: input.setupInstructionsRef,
    status: input.status,
    updatedAtMs: input.updatedAtMs,
  };
}

function toConnectionValues(agentId: string, input: CreateAgentAdapterConnectionInput) {
  return {
    agentId,
    ...input,
    allowedModelPolicyRefs: serializePolicyRefList(input.allowedModelPolicyRefs),
    connectionKey: input.connectionKey ?? null,
    deliveryCapabilityId: input.deliveryCapabilityId ?? null,
    disabledAtMs: null,
    externalSubject: input.externalSubject ?? null,
    grantSummaryRef: input.grantSummaryRef ?? null,
    modelPolicyGrantRef: input.modelPolicyGrantRef ?? null,
    metadataRef: input.metadataRef ?? null,
  };
}

function serializePolicyRefList(value: readonly string[] | undefined): string | null {
  // policy ref だけを JSON 化し、Provider/model ID や credential を allowlist 永続化へ混入させない。
  if (value === undefined) return null;
  const normalized = [
    ...new Set(value.map((entry) => entry.trim().normalize('NFC')).filter(Boolean)),
  ];
  return JSON.stringify(normalized);
}

function toDeliveryValues(agentId: string, input: CreateAgentAdapterDeliveryInput) {
  return {
    agentId,
    ...input,
    eventId: input.eventId ?? null,
    providerOperationId: null,
    providerTargetRef: input.providerTargetRef ?? null,
    requestDigest: input.requestDigest ?? null,
    requestPayloadRef: input.requestPayloadRef ?? null,
    runId: input.runId ?? null,
  };
}
