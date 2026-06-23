import { foreignKey, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Client D1 management ledger の table metadata を表す公開 descriptor です。
 *
 * @remarks
 * schema/boundary tests はこの descriptor を読み、Client D1 が managed Agent registry と credential reference だけを
 * 所有していることを検査します。実 DDL の変更は migration file が source of truth であり、この interface は metadata の形を
 * 固定するためのものです。
 *
 * @example
 * ```ts
 * const definition: ClientD1TableDefinition = {
 *   tableName: 'client_managed_agents',
 *   purpose: 'Client-owned managed Agent registry metadata',
 *   columns: ['agent_id'],
 * };
 * ```
 */
export interface ClientD1TableDefinition {
  readonly tableName: string;
  readonly purpose: string;
  readonly columns: readonly string[];
}

/**
 * Client-owned managed Agent registry を表す Drizzle ORM table 定義です。
 *
 * @remarks
 * columns は `packages/client/src/server/db/migrations/0001_client_foundation.sql` と一致させます。
 * DDL は Wrangler D1 migration が source of truth で、repository code はこの table 定義を通じて DML だけを行います。
 * Agent-domain snapshot は含めず、display metadata と sort/opened state だけを保持します。
 *
 * @example
 * ```ts
 * await db.select().from(clientManagedAgentsTable);
 * ```
 */
export const clientManagedAgentsTable = sqliteTable('client_managed_agents', {
  agentId: text('agent_id').primaryKey(),
  agentRpcOrigin: text('agent_rpc_origin').notNull(),
  displayName: text('display_name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  lastOpenedAtMs: integer('last_opened_at_ms'),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

/**
 * Client-owned credential reference を表す Drizzle ORM table 定義です。
 *
 * @remarks
 * composite primary key と cascade foreign key は migration SQL と一致させます。plaintext secret column は持たず、
 * secret 解決に必要な opaque reference と metadata だけを保存します。Agent credential material を browser や D1 snapshot に
 * 展開しない boundary を保つための table です。
 *
 * @example
 * ```ts
 * await db.select().from(clientAgentCredentialRefsTable);
 * ```
 */
export const clientAgentCredentialRefsTable = sqliteTable(
  'client_agent_credential_refs',
  {
    agentId: text('agent_id').notNull(),
    credentialRef: text('credential_ref').notNull(),
    keyId: text('key_id').notNull(),
    publicFingerprint: text('public_fingerprint').notNull(),
    maskedHint: text('masked_hint').notNull(),
    status: text('status').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.credentialRef] }),
    foreignKey({
      columns: [table.agentId],
      foreignColumns: [clientManagedAgentsTable.agentId],
    }).onDelete('cascade'),
  ]
);

/**
 * managed Agent registry table の metadata descriptor です。
 *
 * @remarks
 * boundary tests と documentation で table purpose/columns を検査するために公開します。runtime write は Drizzle table 定義と
 * repository layer が担当し、この descriptor 自体に副作用はありません。
 */
export const clientManagedAgentsTableMetadata = {
  tableName: 'client_managed_agents',
  purpose: 'Client-owned managed Agent registry metadata',
  columns: [
    'agent_id',
    'agent_rpc_origin',
    'display_name',
    'display_order',
    'pinned',
    'last_opened_at_ms',
    'created_at_ms',
    'updated_at_ms',
  ],
} as const satisfies ClientD1TableDefinition;

/**
 * credential secret reference table の metadata descriptor です。
 *
 * @remarks
 * plaintext secret body を持たないことを columns list で明示し、Client D1 が credential reference だけを所有する boundary を
 * test から確認できるようにします。実データの読み書きは repository layer に限定します。
 */
export const clientAgentCredentialRefsTableMetadata = {
  tableName: 'client_agent_credential_refs',
  purpose: 'Client-owned credential references without secret bodies',
  columns: [
    'agent_id',
    'credential_ref',
    'key_id',
    'public_fingerprint',
    'masked_hint',
    'status',
    'created_at_ms',
    'updated_at_ms',
  ],
} as const satisfies ClientD1TableDefinition;

/**
 * Client D1 management ledger が所有する table metadata の完全な一覧です。
 *
 * @remarks
 * tests はこの一覧を source として、Client D1 が Agent-domain snapshots を追加していないことを確認します。
 * 新しい table を追加する場合は migration、repository、boundary rationale を同時に更新する必要があります。
 */
export const clientD1Tables = [
  clientManagedAgentsTableMetadata,
  clientAgentCredentialRefsTableMetadata,
] as const;

/**
 * Client D1 から意図的に除外する Agent-domain snapshot table 名です。
 *
 * @remarks
 * Client は managed Agent records と credential references だけを所有します。Events、Threads、Runs、Schedules、Tools、
 * Integrations、Compactions などの Agent-domain state は Agent Worker / Agent-owned storage から Server Actions 経由で読むため、
 * ここに列挙した table を Client D1 に追加してはいけません。
 */
export const forbiddenClientAgentSnapshotTables = [
  'agent_events',
  'agent_threads',
  'agent_runs',
  'agent_schedules',
  'agent_tool_invocations',
  'agent_integration_installations',
  'agent_adapter_connections',
  'agent_compactions',
] as const;
