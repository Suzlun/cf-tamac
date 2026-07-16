import { eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * Agent-owned SQLite の `agent_initialization_receipts` に対応する初期化receipt行です。
 *
 * @remarks
 * この行は、Clientが登録応答を失った場合に登録試行を照合するための不変証拠です。
 * `agentId`、`idempotencyKey`、`registrationRequestDigest`、作成時刻だけを保持し、
 * request本文、credential、JWT、秘密鍵、provider secretなどの機密情報は保存しません。
 * `agentId` はrepositoryの束縛先と一致し、残りの値は成功したInitializeAgent commandの値と完全一致します。
 *
 * @example
 * ```ts
 * const receipt = repository.getReceipt();
 * if (receipt?.registrationRequestDigest !== expectedDigest) {
 *   throw new Error('registration attempt does not match');
 * }
 * ```
 */
export interface AgentInitializationReceiptRow {
  /**
   * 初期化されたAgent aggregateを識別するrepository束縛済みのIDです。
   *
   * この値はfactoryの`agentId`から設定され、receiptのcross-Agent読み取りを防ぎます。
   */
  readonly agentId: string;
  /**
   * 成功したInitializeAgent commandで使用した再実行識別子です。
   *
   * 同じAgentの初期化receiptでは不変で、同じkeyの別commandをconflictとして識別します。
   */
  readonly idempotencyKey: string;
  /**
   * Clientが固定した登録要求digestで、登録試行との照合に使う不変値です。
   *
   * 入力の空白だけの値はrepositoryでも拒否し、保存済み値は入力文字列と完全一致させます。
   */
  readonly registrationRequestDigest: string;
  /**
   * receiptが最初に確定したUnix epoch millisecond時刻です。
   *
   * 既存receiptの再実行では更新せず、初回のimmutableな確定時刻を保持します。
   */
  readonly createdAtMs: number;
}

/**
 * Agent initialization receiptを新規確定するための入力です。
 *
 * @remarks
 * `agentId`はrepository factoryで束縛するため入力に含めません。
 * 初回insert後に同じAgentへ別の値を渡してもreceiptは上書きせず、呼び出し元が
 * idempotency conflictまたはstorage invariant違反として扱えるようにします。
 *
 * @example
 * ```ts
 * repository.upsertReceipt({
 *   createdAtMs: Date.now(),
 *   idempotencyKey: 'registration-1',
 *   registrationRequestDigest: 'sha256:...',
 * });
 * ```
 */
export interface UpsertAgentInitializationReceiptInput {
  /**
   * 成功したInitializeAgent commandのidempotency keyです。
   *
   * repositoryはこの値をAgent IDと組み合わせたreceipt identityとして保存します。
   */
  readonly idempotencyKey: string;
  /**
   * 空白だけではない、Client登録要求の照合用digestです。
   *
   * domain validation済みの値を受け取り、既存receiptとの差異を上書きせず例外にします。
   */
  readonly registrationRequestDigest: string;
  /**
   * receiptが確定したUnix epoch millisecond時刻です。
   *
   * 初回insertのcreated_at_msへ書き込み、conflict replayでは既存時刻を維持します。
   */
  readonly createdAtMs: number;
}

/**
 * Agent-owned initialization receiptの永続化操作を提供するrepository契約です。
 *
 * @remarks
 * このrepositoryはAgent IDに束縛され、Agent Durable Object SQLiteのreceipt tableだけを読み書きします。
 * `upsertReceipt`という名前ですが、既存行を更新するupsertではありません。初回insertを行い、
 * 既存行がある場合はimmutableな値を比較して一致しなければ例外を送出します。
 * transactionはfactoryの外側で開始し、profile/config/audit/idempotency responseと同じSQLite transactionへ参加させます。
 *
 * @example
 * ```ts
 * const receipt = repository.getReceipt();
 * if (receipt === undefined) repository.upsertReceipt(input);
 * ```
 */
export interface AgentInitializationReceiptRepository {
  /**
   * このrepositoryが使用するSQLite tableの固定名です。
   *
   * initializer、schema、repository factoryが共有するAgent-owned receipt storageの識別子です。
   */
  readonly tableName: 'agent_initialization_receipts';

  /**
   * 束縛済みAgentの初期化receiptを一件取得します。
   *
   * @returns 保存済みreceipt、または未初期化で行が存在しない場合の`undefined`です。
   * @throws SQLite queryが失敗した場合はstorage errorを呼び出し元へ伝播します。
   * @example
   * ```ts
   * const receipt = repository.getReceipt();
   * ```
   */
  getReceipt(): AgentInitializationReceiptRow | undefined;

  /**
   * 初期化receiptを一度だけ確定し、既存値と入力値が一致することを確認します。
   *
   * @param input 成功したInitializeAgent commandから抽出したkey、digest、確定時刻です。
   * @returns 値を返さず、insertまたは既存値の一致確認を完了します。
   * @throws digestが空白だけの場合、SQLite insert/queryが失敗した場合、既存receiptがkeyまたはdigestと
   * 一致しない場合に例外を送出します。既存値は上書きされません。
   * @example
   * ```ts
   * repository.upsertReceipt({
   *   createdAtMs: command.context.requestedAtMs,
   *   idempotencyKey: command.context.idempotencyKey,
   *   registrationRequestDigest: command.registrationRequestDigest,
   * });
   * ```
   */
  upsertReceipt(input: UpsertAgentInitializationReceiptInput): void;
}

/**
 * Agent IDに束縛された初期化receipt repositoryを作成します。
 *
 * @param agentId repositoryが読み書きできる単一Agent aggregateのIDです。
 * @param database Agent-owned Durable Object SQLiteへ接続されたDrizzle database adapterです。
 * @returns 指定Agentだけを対象にreceiptを読み書きするrepositoryです。
 * @throws factory自体ではqueryを実行しないため通常は例外を投げません。返却methodのSQLite操作が失敗した場合は
 * そのstorage errorが呼び出し元へ伝播します。
 * @example
 * ```ts
 * const repository = createAgentInitializationReceiptRepository('agent-1', database);
 * const receipt = repository.getReceipt();
 * ```
 */
export function createAgentInitializationReceiptRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentInitializationReceiptRepository {
  // schema objectからreceipt tableを取得し、repository全methodが同じAgent-owned tableを参照します。
  const table = agentStorageDrizzleSchema.agentInitializationReceipts;

  // repository束縛済みのread operationをclosureへ置き、upsert後のpostcondition確認にも同じqueryを再利用します。
  const getReceipt = (): AgentInitializationReceiptRow | undefined =>
    database.select().from(table).where(eq(table.agentId, agentId)).limit(1).get();

  return {
    tableName: 'agent_initialization_receipts',
    getReceipt,
    upsertReceipt(input) {
      // 空白だけのdigestは登録照合証拠にならず、低いstorage layerでも不変状態への混入を拒否します。
      if (input.registrationRequestDigest.trim() === '') {
        throw new Error('Agent initialization receipt digest must not be empty.');
      }

      // 初回だけ行をinsertし、競合時は既存receiptをimmutableに維持します。
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.createdAtMs,
          idempotencyKey: input.idempotencyKey,
          registrationRequestDigest: input.registrationRequestDigest,
        })
        .onConflictDoNothing()
        .run();

      // insert後に保存値を読み直し、SQLiteが受け入れたpostconditionを呼び出し元へ確認します。
      const stored = getReceipt();
      if (stored === undefined) {
        throw new Error('Agent initialization receipt was not persisted.');
      }

      // 同一Agentのreceiptを別の登録試行で上書きできないよう、両方のimmutable identityを比較します。
      if (
        stored.idempotencyKey !== input.idempotencyKey ||
        stored.registrationRequestDigest !== input.registrationRequestDigest
      ) {
        throw new Error('Agent initialization receipt does not match the requested command.');
      }
    },
  };
}
