import type {
  InsertAgentToolInvocationInput,
  UpsertAgentProviderOperationInput,
  UpsertAgentToolDefinitionInput,
} from './tools-repository-types';

/**
 * ToolDefinition insert 用の Drizzle value を作成します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param input ToolDefinition upsert 入力です。
 * @returns nullable column と boolean integer を storage schema に合わせた insert value です。
 * @throws 純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * database.insert(table).values(toDefinitionValues(agentId, input)).run();
 * ```
 */
export function toDefinitionValues(agentId: string, input: UpsertAgentToolDefinitionInput) {
  return {
    agentId,
    approvalRequired: input.approvalRequired ? 1 : 0,
    cancellationSupported: input.cancellationSupported === true ? 1 : 0,
    createdAtMs: input.createdAtMs,
    description: input.description ?? null,
    displayName: input.displayName,
    inputSchemaRef: input.inputSchemaRef ?? null,
    installationId: input.installationId ?? null,
    outputSchemaRef: input.outputSchemaRef ?? null,
    providerTargetRef: input.providerTargetRef ?? null,
    status: input.status,
    toolId: input.toolId,
    toolSetVersion: input.toolSetVersion,
    updatedAtMs: input.updatedAtMs,
    version: input.version,
  };
}

/**
 * ToolDefinition update 用の Drizzle value を作成します。
 *
 * @param input ToolDefinition upsert 入力です。
 * @returns nullable column と boolean integer を storage schema に合わせた update value です。
 * @throws 純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * database.update(table).set(toDefinitionUpdateValues(input)).run();
 * ```
 */
export function toDefinitionUpdateValues(input: UpsertAgentToolDefinitionInput) {
  return {
    approvalRequired: input.approvalRequired ? 1 : 0,
    cancellationSupported: input.cancellationSupported === true ? 1 : 0,
    description: input.description ?? null,
    displayName: input.displayName,
    inputSchemaRef: input.inputSchemaRef ?? null,
    installationId: input.installationId ?? null,
    outputSchemaRef: input.outputSchemaRef ?? null,
    providerTargetRef: input.providerTargetRef ?? null,
    status: input.status,
    toolSetVersion: input.toolSetVersion,
    updatedAtMs: input.updatedAtMs,
    version: input.version,
  };
}

/**
 * ToolInvocation insert 用の Drizzle value を作成します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param input ToolInvocation insert 入力です。
 * @returns optional fields を SQLite nullable column に合わせた insert value です。
 * @throws 純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * database.insert(table).values(toInvocationValues(agentId, input)).run();
 * ```
 */
export function toInvocationValues(agentId: string, input: InsertAgentToolInvocationInput) {
  return {
    agentId,
    auditEventId: input.auditEventId ?? null,
    causationEventId: input.causationEventId ?? null,
    createdAtMs: input.createdAtMs,
    idempotencyKey: input.idempotencyKey,
    inputRef: input.inputRef ?? null,
    installationId: input.installationId ?? null,
    invocationId: input.invocationId,
    runId: input.runId,
    status: input.status,
    threadId: input.threadId,
    toolId: input.toolId,
    toolSetVersion: input.toolSetVersion,
    updatedAtMs: input.createdAtMs,
  };
}

/**
 * Provider operation insert 用の Drizzle value を作成します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param input Provider operation upsert 入力です。
 * @returns optional fields と boolean integer を storage schema に合わせた insert value です。
 * @throws 純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * database.insert(table).values(toProviderOperationValues(agentId, input)).run();
 * ```
 */
export function toProviderOperationValues(
  agentId: string,
  input: UpsertAgentProviderOperationInput
) {
  return {
    agentId,
    attemptCount: input.attemptCount,
    cancellationSupported: input.cancellationSupported === true ? 1 : 0,
    createdAtMs: input.createdAtMs,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    invocationId: input.invocationId ?? null,
    method: input.method,
    nonce: input.nonce ?? null,
    operationId: input.operationId,
    providerOperationRef: input.providerOperationRef ?? null,
    providerTargetRef: input.providerTargetRef ?? null,
    requestDigest: input.requestDigest ?? null,
    status: input.status,
    timeoutAtMs: input.timeoutAtMs ?? null,
    toolId: input.toolId ?? null,
    updatedAtMs: input.updatedAtMs,
  };
}

/**
 * Provider operation update 用の Drizzle value を作成します。
 *
 * @param input Provider operation upsert 入力です。
 * @returns optional fields と boolean integer を storage schema に合わせた update value です。
 * @throws 純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * database.update(table).set(toProviderOperationUpdateValues(input)).run();
 * ```
 */
export function toProviderOperationUpdateValues(input: UpsertAgentProviderOperationInput) {
  return {
    attemptCount: input.attemptCount,
    cancellationSupported: input.cancellationSupported === true ? 1 : 0,
    idempotencyKey: input.idempotencyKey,
    method: input.method,
    nonce: input.nonce ?? null,
    providerOperationRef: input.providerOperationRef ?? null,
    providerTargetRef: input.providerTargetRef ?? null,
    requestDigest: input.requestDigest ?? null,
    status: input.status,
    timeoutAtMs: input.timeoutAtMs ?? null,
    updatedAtMs: input.updatedAtMs,
  };
}

/**
 * SQLite update 結果が少なくとも 1 行を書き換えたことを検証します。
 *
 * @param result Drizzle `run()` が返す runtime 固有の結果です。
 * @param message 更新対象が存在しない、または条件が一致しなかった場合の安全な error message です。
 * @returns 更新件数が 1 件以上の場合は値を返さず、呼び出し元の repository 処理を継続させます。
 * @throws 更新件数を取得でき、かつ 0 件だった場合に Error を投げます。
 * @example
 * ```ts
 * assertConditionalUpdateAffected(database.update(table).set(values).run(), 'conditional update failed');
 * ```
 */
export function assertConditionalUpdateAffected(result: unknown, message: string): void {
  const candidate = result as {
    readonly changes?: number;
    readonly meta?: { readonly changes?: number };
    readonly rowsAffected?: number;
  };
  const affectedRows = candidate.rowsAffected ?? candidate.changes ?? candidate.meta?.changes;
  if (affectedRows === 0) throw new Error(message);
}
