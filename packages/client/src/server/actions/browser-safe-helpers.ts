/**
 * unknown 値を Browser へ渡せる安全な文字列へ変換する。
 *
 * @param value - Agent RPC や Client D1 から受け取った未検証の値。
 * @param fallback - `value` が文字列ではない場合に返す代替値。
 * @returns 文字列の場合はその値、それ以外は `fallback`。
 * @throws 例外は送出しない。非文字列を暗黙に `String()` へ通さないことで
 *         `[object Object]` や秘密を含む構造の誤表示を防ぐ。
 * @example
 * ```ts
 * const label = toSafeString(agent.status, 'unknown');
 * ```
 */
export function toSafeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * unknown 値を Browser へ渡せる安全な数値へ変換する。
 *
 * @param value - Agent RPC や Client D1 から受け取った未検証の値。
 * @param fallback - `value` が数値ではない場合に返す代替値。
 * @returns 数値の場合はその値、それ以外は `fallback`。
 * @throws 例外は送出しない。文字列数値の暗黙変換は行わない。
 * @example
 * ```ts
 * const count = toSafeNumber(summary.threadCount);
 * ```
 */
export function toSafeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

/**
 * Protobuf `int64` 相当の値を Browser へ渡せる文字列へ変換する。
 *
 * @param value - Protobuf-ES が返す `bigint`、数値、または既に文字列化済みの値。
 * @param fallback - 対応外の型だった場合に返す代替値。
 * @returns `bigint` / `number` / `string` を文字列化した値、または `fallback`。
 * @throws 例外は送出しない。`bigint` をそのまま Server Action 結果へ含めず、
 *         JSON 直列化失敗を防ぐ。
 * @example
 * ```ts
 * const sequence = toSafeStringFromInt64(event.agentSequence);
 * ```
 */
export function toSafeStringFromInt64(value: unknown, fallback = ''): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return fallback;
}

/**
 * unknown 値から空ではない任意文字列だけを抽出する。
 *
 * @param value - Agent RPC やフォーム入力から受け取った未検証の値。
 * @returns 空ではない文字列の場合はその値、それ以外は `undefined`。
 * @throws 例外は送出しない。空文字は省略値として扱う。
 * @example
 * ```ts
 * const runId = toOptionalString(event.runId);
 * ```
 */
export function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Browser へ渡せる Agent-owned payload 参照メタデータ。
 *
 * @remarks
 * `inlineBytes` は含めない。UI は R2 参照、digest、サイズ、content type のみを
 * 表示し、blob 本文を Browser へ取得させない。
 */
export interface BrowserSafePayloadReference {
  readonly ref: string;
  readonly contentType: string;
  readonly byteSize: string;
  readonly sha256: string;
  readonly storageClass: string;
}

/**
 * Agent RPC の cursor pagination 入力を Browser-safe に表現する型。
 *
 * @remarks
 * token は opaque な cursor として扱い、Agent/Thread scope を `cursorScope` に
 * 固定する。Client D1 には保存しない。
 */
export interface BrowserSafePageInput {
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly orderBy?: string;
  readonly filter?: string;
  readonly cursorScope?: string;
}

/**
 * Agent RPC の cursor pagination 結果を Browser-safe に表現する型。
 *
 * @remarks
 * `nextPageToken` は次ページ取得のためだけに使う opaque cursor であり、
 * Agent-domain snapshot として Client D1 へ永続化しない。
 */
export interface BrowserSafePageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

/**
 * Browser-safe な一覧データと cursor pagination metadata を束ねる型。
 *
 * @typeParam T - Browser へ渡してよい安全化済み行データ。
 */
export interface BrowserSafePagedResult<T> {
  readonly items: readonly T[];
  readonly page: BrowserSafePageInfo;
}

/**
 * Agent config editor に渡してよい安全な preview JSON です。
 *
 * @remarks
 * Agent RPC の generated `AgentConfig` には model policy summary、validation result、payload reference、
 * `bigint` timestamp など Browser / Server Action return 境界へそのまま渡すべきではない値が含まれます。
 * この型は operator が汎用 config JSON editor で編集できる safe string field だけを表し、
 * `modelPolicyRef` は専用の default model policy section だけで扱います。
 */
export interface BrowserSafeAgentConfigPreview extends Record<string, string | undefined> {
  readonly displayName?: string;
  readonly budgetPolicyRef?: string;
  readonly memoryPolicyRef?: string;
  readonly toolPolicyRef?: string;
  readonly schedulePolicyRef?: string;
}

type BrowserSafeAgentConfigPreviewFieldName =
  | 'displayName'
  | 'budgetPolicyRef'
  | 'memoryPolicyRef'
  | 'toolPolicyRef'
  | 'schedulePolicyRef';

type MutableBrowserSafeAgentConfigPreview = Record<
  BrowserSafeAgentConfigPreviewFieldName,
  string | undefined
> &
  Record<string, string | undefined>;

/**
 * unknown 値がプレーンな object として扱える場合だけ `Record` として返す。
 *
 * @param value - Agent RPC から返された未検証の値。
 * @returns object の場合は `Record<string, unknown>`、それ以外は `undefined`。
 * @throws 例外は送出しない。配列も object として扱えるが、呼び出し側が必要な
 *         field だけを安全に抽出する。
 */
export function toSafeRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Agent RPC の payload 参照から Browser 表示用メタデータだけを抽出する。
 *
 * @param value - `BytePayloadReference` 互換の未検証値。
 * @returns ref/content type/size/digest/storage class のみを含む値。
 * @throws 例外は送出しない。`inlineBytes` は意図的に除外する。
 */
export function toBrowserSafePayloadReference(
  value: unknown
): BrowserSafePayloadReference | undefined {
  const record = toSafeRecord(value);
  if (record === undefined) {
    return undefined;
  }
  return {
    ref: toSafeString(record.ref),
    contentType: toSafeString(record.contentType),
    byteSize: toSafeStringFromInt64(record.byteSize),
    sha256: toSafeString(record.sha256),
    storageClass: toSafeString(record.storageClass),
  };
}

/**
 * Agent RPC の config response から汎用 editor 用の安全な preview だけを抽出する。
 *
 * @param value - generated `AgentConfig` 互換の未検証値。
 * @returns Browser へ渡せる safe string field だけを含む preview object。
 * @throws 例外は送出しない。`defaultModelPolicy`、`modelPolicyValidation`、`configBodyRef`、
 *         `inlineBytes`、`bigint`、credential 情報は意図的に含めない。
 * @example
 * ```ts
 * const configJson = JSON.stringify(toBrowserSafeAgentConfigPreview(response.config), null, 2);
 * ```
 */
export function toBrowserSafeAgentConfigPreview(value: unknown): BrowserSafeAgentConfigPreview {
  const record = toSafeRecord(value);
  const preview: MutableBrowserSafeAgentConfigPreview = {
    budgetPolicyRef: undefined,
    displayName: undefined,
    memoryPolicyRef: undefined,
    schedulePolicyRef: undefined,
    toolPolicyRef: undefined,
  };
  setConfigPreviewField(preview, 'displayName', record?.displayName);
  setConfigPreviewField(preview, 'budgetPolicyRef', record?.budgetPolicyRef);
  setConfigPreviewField(preview, 'memoryPolicyRef', record?.memoryPolicyRef);
  setConfigPreviewField(preview, 'toolPolicyRef', record?.toolPolicyRef);
  setConfigPreviewField(preview, 'schedulePolicyRef', record?.schedulePolicyRef);
  return removeUndefinedConfigPreviewFields(preview);
}

function setConfigPreviewField(
  preview: MutableBrowserSafeAgentConfigPreview,
  fieldName: BrowserSafeAgentConfigPreviewFieldName,
  value: unknown
): void {
  const safeValue = toOptionalString(value);
  if (safeValue === undefined) return;
  if (fieldName === 'displayName') preview.displayName = safeValue;
  if (fieldName === 'budgetPolicyRef') preview.budgetPolicyRef = safeValue;
  if (fieldName === 'memoryPolicyRef') preview.memoryPolicyRef = safeValue;
  if (fieldName === 'toolPolicyRef') preview.toolPolicyRef = safeValue;
  if (fieldName === 'schedulePolicyRef') preview.schedulePolicyRef = safeValue;
}

function removeUndefinedConfigPreviewFields(
  preview: MutableBrowserSafeAgentConfigPreview
): BrowserSafeAgentConfigPreview {
  return {
    ...(preview.displayName === undefined ? {} : { displayName: preview.displayName }),
    ...(preview.budgetPolicyRef === undefined ? {} : { budgetPolicyRef: preview.budgetPolicyRef }),
    ...(preview.memoryPolicyRef === undefined ? {} : { memoryPolicyRef: preview.memoryPolicyRef }),
    ...(preview.toolPolicyRef === undefined ? {} : { toolPolicyRef: preview.toolPolicyRef }),
    ...(preview.schedulePolicyRef === undefined
      ? {}
      : { schedulePolicyRef: preview.schedulePolicyRef }),
  };
}

/**
 * Agent RPC の PageResponse 互換値を Browser-safe な page metadata へ変換する。
 *
 * @param value - `PageResponse` 互換の未検証値。
 * @returns 次 page token、結果件数、cursor scope。未指定時は空の metadata。
 * @throws 例外は送出しない。opaque token は復号せずそのまま表示/リンク用途に留める。
 */
export function toBrowserSafePageInfo(value: unknown): BrowserSafePageInfo {
  const record = toSafeRecord(value);
  return {
    nextPageToken: toOptionalString(record?.nextPageToken),
    resultCount: toSafeNumber(record?.resultCount),
    cursorScope: toOptionalString(record?.cursorScope),
  };
}

/**
 * Agent RPC へ渡す scoped cursor pagination request を組み立てる。
 *
 * @param agentId - 対象 Agent ID。cursor scope の一部として固定する。
 * @param resource - `threads` や `runs` など一覧種別。scope 混線を防ぐ。
 * @param input - Browser から渡された opaque cursor と表示条件。
 * @returns `PageRequest` 互換の plain object。
 * @throws `agentId` または `resource` が空の場合は `TypeError`。
 * @example
 * ```ts
 * const page = buildScopedPageRequest('agent-alpha', 'threads', { pageSize: 25 });
 * ```
 */
export function buildScopedPageRequest(
  agentId: string,
  resource: string,
  input: BrowserSafePageInput = {}
): Record<string, number | string> {
  if (agentId === '' || resource === '') {
    throw new TypeError('agentId and resource must not be empty.');
  }

  const pageSize = input.pageSize ?? 25;
  const request: Record<string, number | string> = {
    pageSize,
    cursorScope: input.cursorScope ?? `agent:${agentId}:${resource}`,
  };
  if (input.pageToken !== undefined) {
    request.pageToken = input.pageToken;
  }
  if (input.orderBy !== undefined) {
    request.orderBy = input.orderBy;
  }
  if (input.filter !== undefined) {
    request.filter = input.filter;
  }
  return request;
}
