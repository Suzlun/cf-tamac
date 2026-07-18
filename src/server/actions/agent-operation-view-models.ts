import {
  toBrowserSafePayloadReference,
  toOptionalString,
  toSafeNumber,
  toSafeRecord,
  toSafeString,
  toSafeStringFromInt64,
  type BrowserSafePageInput,
  type BrowserSafePayloadReference,
} from './browser-safe-helpers';

/**
 * Schedule 一覧 RPC の filter と cursor 入力。
 *
 * @remarks Thread / Installation / status の scope を Server Action で固定する。
 */
export interface ListSchedulesOptions {
  readonly threadId?: string;
  readonly installationId?: string;
  readonly status?: string;
  readonly page?: BrowserSafePageInput;
}

/**
 * Tool catalog 一覧 RPC の filter と cursor 入力。
 *
 * @remarks unavailable Tool を含めるかどうかと Installation scope だけを Browser から受け取る。
 */
export interface ListToolsOptions {
  readonly includeUnavailable?: boolean;
  readonly installationId?: string;
  readonly page?: BrowserSafePageInput;
}

/**
 * ToolInvocation 一覧 RPC の filter と cursor 入力。
 *
 * @remarks Thread、Run、Installation、status の scope を Agent RPC request に反映する。
 */
export interface ListInvocationsOptions {
  readonly threadId?: string;
  readonly runId?: string;
  readonly status?: string;
  readonly installationId?: string;
  readonly page?: BrowserSafePageInput;
}

/**
 * Integration 一覧 RPC の filter と cursor 入力。
 *
 * @remarks status filter と cursor のみを受け、Provider secret は一切受け取らない。
 */
export interface ListInstallationsOptions {
  readonly status?: string;
  readonly page?: BrowserSafePageInput;
}

/**
 * Browser-safe Schedule summary。
 *
 * @remarks Thread context、overlap policy、next fire、audit ref を表示用に返す。
 */
export interface BrowserSafeScheduleSummary {
  readonly scheduleId: string;
  readonly status: string;
  readonly threadId?: string;
  readonly threadKey?: string;
  readonly scheduleSpec: string;
  readonly overlapPolicy?: string;
  readonly nextFireAtUnixMs?: string;
  readonly lastFireAtUnixMs?: string;
  readonly installationId?: string;
  readonly createdByPrincipalId?: string;
  readonly callbackIdentity?: string;
  readonly createdAtUnixMs: string;
  readonly cancelledAtUnixMs?: string;
  readonly auditEventId?: string;
}

/**
 * Browser-safe Tool definition summary。
 *
 * @remarks Provider target や schema は参照メタデータだけを返す。
 */
export interface BrowserSafeToolSummary {
  readonly toolId: string;
  readonly displayName: string;
  readonly status: string;
  readonly version?: string;
  readonly description?: string;
  readonly approvalRequired: boolean;
  readonly installationId?: string;
  readonly providerTargetRef?: string;
  readonly toolSetVersion?: string;
}

/**
 * Browser-safe Tool invocation summary。
 *
 * @remarks input/output は R2 参照メタデータだけを含め、本文や secret-looking field を返さない。
 */
export interface BrowserSafeInvocationSummary {
  readonly invocationId: string;
  readonly status: string;
  readonly toolId: string;
  readonly threadId?: string;
  readonly runId?: string;
  readonly installationId?: string;
  readonly approvalId?: string;
  readonly attemptCount: number;
  readonly providerOperationId?: string;
  readonly resultEventId?: string;
  readonly inputRef?: BrowserSafePayloadReference;
  readonly outputRef?: BrowserSafePayloadReference;
  readonly inputSummary: string;
  readonly riskLevel: string;
  readonly createdAtUnixMs: string;
  readonly updatedAtUnixMs: string;
}

/**
 * Browser-safe Tool invocation detail。
 *
 * @remarks approval と Provider operation も safe label / ref のみに変換する。
 */
export interface BrowserSafeInvocationDetail extends BrowserSafeInvocationSummary {
  readonly approval?: BrowserSafeToolApproval;
  readonly providerOperation?: BrowserSafeProviderOperation;
}

/**
 * Browser-safe Tool approval audit metadata。
 *
 * @remarks acting user と audit event を表示するための安全な metadata だけを含む。
 */
export interface BrowserSafeToolApproval {
  readonly approvalId: string;
  readonly decision: string;
  readonly principalId: string;
  readonly reason?: string;
  readonly decidedAtUnixMs: string;
  readonly auditEventId?: string;
}

/**
 * Browser-safe Provider operation metadata。
 *
 * @remarks Provider operation body は返さず、operation ID、status、timeout だけを表示する。
 */
export interface BrowserSafeProviderOperation {
  readonly operationId: string;
  readonly installationId: string;
  readonly status: string;
  readonly providerOperationRef?: string;
  readonly timeoutAtUnixMs?: string;
}

/**
 * Browser-safe Integration grant metadata。
 *
 * @remarks grant scope と status だけを表示し、Provider credential material は含めない。
 */
export interface BrowserSafeIntegrationGrant {
  readonly grantId: string;
  readonly grantType: string;
  readonly scope: string;
  readonly status: string;
}

/**
 * Browser-safe Adapter Connection metadata。
 *
 * @remarks connection secret は含めず、connection ID と metadata ref だけを返す。
 */
export interface BrowserSafeAdapterConnectionSummary {
  readonly connectionId: string;
  readonly installationId: string;
  readonly adapterId: string;
  readonly status: string;
  readonly grantSummaryRef?: string;
  readonly deliveryCapabilityId?: string;
  readonly metadataRef?: BrowserSafePayloadReference;
}

/**
 * Browser-safe Integration uninstall cleanup summary。
 *
 * @remarks cleanup の件数と audit event だけを返し、Provider 側の raw response は返さない。
 */
export interface BrowserSafeIntegrationCleanupResult {
  readonly disabledAdapterConnections: number;
  readonly auditEventId?: string;
  readonly toolsDisabledLabel: string;
  readonly schedulesCancelledLabel: string;
  readonly deliveryRevokedLabel: string;
  readonly trustKeysRevokedLabel: string;
}

/**
 * Browser-safe Integration installation summary。
 *
 * @remarks Provider identity、manifest digest、grants、Adapter、Tools、Delivery capability を
 * safe label / ref として返し、Provider signing key や connection secret は返さない。
 */
export interface BrowserSafeInstallationSummary {
  readonly installationId: string;
  readonly status: string;
  readonly integrationId?: string;
  readonly providerIdentity?: string;
  readonly manifestDigest?: string;
  readonly schemaVersion?: string;
  readonly grantSummaryRef?: string;
  readonly setupInstructionsRef?: BrowserSafePayloadReference;
  readonly installedAtUnixMs?: string;
  readonly updatedAtUnixMs?: string;
  readonly grants: readonly BrowserSafeIntegrationGrant[];
  readonly adapterConnections: readonly BrowserSafeAdapterConnectionSummary[];
  readonly tools: readonly BrowserSafeToolSummary[];
  readonly deliveryCapabilityCount: number;
  readonly cleanupResult?: BrowserSafeIntegrationCleanupResult;
}

/** AgentScheduleService の Schedule response を Browser-safe summary に変換する。 */
export function toBrowserSafeScheduleSummary(
  schedule: unknown,
  fallbackScheduleId = '',
  fallbackStatus = ''
): BrowserSafeScheduleSummary {
  const record = toSafeRecord(schedule);
  return {
    scheduleId: toSafeString(record?.scheduleId, fallbackScheduleId),
    status: toSafeString(record?.status, fallbackStatus),
    threadId: toOptionalString(record?.threadId),
    threadKey: toOptionalString(record?.threadKey),
    scheduleSpec: toSafeString(record?.scheduleSpec),
    overlapPolicy: toOptionalString(record?.overlapPolicy),
    nextFireAtUnixMs: toOptionalInt64String(record?.nextFireAtUnixMs),
    lastFireAtUnixMs: toOptionalInt64String(record?.lastFireAtUnixMs),
    installationId: toOptionalString(record?.installationId),
    createdByPrincipalId: toOptionalString(record?.createdByPrincipalId),
    callbackIdentity: toOptionalString(record?.callbackIdentity),
    createdAtUnixMs: toSafeStringFromInt64(record?.createdAtUnixMs),
    cancelledAtUnixMs: toOptionalInt64String(record?.cancelledAtUnixMs),
    auditEventId: toOptionalString(record?.auditEventId),
  };
}

/** AgentToolService の Tool response を Browser-safe summary に変換する。 */
export function toBrowserSafeToolSummary(tool: unknown): BrowserSafeToolSummary {
  const record = toSafeRecord(tool);
  return {
    toolId: toSafeString(record?.toolId),
    displayName: toSafeString(record?.displayName),
    status: toSafeString(record?.status),
    version: toOptionalString(record?.version),
    description: toOptionalString(record?.description),
    approvalRequired: record?.approvalRequired === true,
    installationId: toOptionalString(record?.installationId),
    providerTargetRef: toOptionalString(record?.providerTargetRef),
    toolSetVersion: toOptionalString(record?.toolSetVersion),
  };
}

/** AgentToolService の ToolInvocation response を Browser-safe summary に変換する。 */
export function toBrowserSafeInvocationSummary(
  invocation: unknown,
  fallbackInvocationId = '',
  fallbackStatus = ''
): BrowserSafeInvocationSummary {
  const record = toSafeRecord(invocation);
  const inputRef = toBrowserSafePayloadReference(record?.inputRef);
  return {
    invocationId: toSafeString(record?.invocationId, fallbackInvocationId),
    status: toSafeString(record?.status, fallbackStatus),
    toolId: toSafeString(record?.toolId),
    threadId: toOptionalString(record?.threadId),
    runId: toOptionalString(record?.runId),
    installationId: toOptionalString(record?.installationId),
    approvalId: toOptionalString(record?.approvalId),
    attemptCount: toSafeNumber(record?.attemptCount),
    providerOperationId: toOptionalString(record?.providerOperationId),
    resultEventId: toOptionalString(record?.resultEventId),
    inputRef,
    outputRef: toBrowserSafePayloadReference(record?.outputRef),
    inputSummary: buildInputSummary(inputRef),
    riskLevel: deriveRiskLevel(record?.status, inputRef),
    createdAtUnixMs: toSafeStringFromInt64(record?.createdAtUnixMs),
    updatedAtUnixMs: toSafeStringFromInt64(record?.updatedAtUnixMs),
  };
}

/** Tool approval response を Browser-safe audit metadata に変換する。 */
export function toBrowserSafeApproval(approval: unknown): BrowserSafeToolApproval | undefined {
  const record = toSafeRecord(approval);
  if (record === undefined) {
    return undefined;
  }
  return {
    approvalId: toSafeString(record.approvalId),
    decision: toSafeString(record.decision),
    principalId: toSafeString(record.principalId),
    reason: toOptionalString(record.reason),
    decidedAtUnixMs: toSafeStringFromInt64(record.decidedAtUnixMs),
    auditEventId: toOptionalString(record.auditEventId),
  };
}

/** Provider operation response を Browser-safe metadata に変換する。 */
export function toBrowserSafeProviderOperation(
  operation: unknown
): BrowserSafeProviderOperation | undefined {
  const record = toSafeRecord(operation);
  if (record === undefined) {
    return undefined;
  }
  return {
    operationId: toSafeString(record.operationId),
    installationId: toSafeString(record.installationId),
    status: toSafeString(record.status),
    providerOperationRef: toOptionalString(record.providerOperationRef),
    timeoutAtUnixMs: toOptionalInt64String(record.timeoutAtUnixMs),
  };
}

/** Integration installation response を Browser-safe summary に変換する。 */
export function toBrowserSafeInstallationSummary(
  installation: unknown,
  detail?: unknown,
  extras: {
    readonly adapterConnections?: readonly BrowserSafeAdapterConnectionSummary[];
    readonly tools?: readonly BrowserSafeToolSummary[];
    readonly cleanupResult?: BrowserSafeIntegrationCleanupResult;
  } = {}
): BrowserSafeInstallationSummary {
  const record = toSafeRecord(installation);
  const detailRecord = toSafeRecord(detail);
  const definition = toSafeRecord(detailRecord?.definition);
  const grants = Array.isArray(detailRecord?.grants)
    ? detailRecord.grants.map(toBrowserSafeIntegrationGrant)
    : [];
  return {
    installationId: toSafeString(record?.installationId),
    status: toSafeString(record?.status),
    integrationId: toOptionalString(record?.integrationId),
    providerIdentity: toOptionalString(record?.providerId),
    manifestDigest: toOptionalString(record?.manifestDigestSha256),
    schemaVersion: toOptionalString(record?.schemaVersion ?? definition?.schemaVersion),
    grantSummaryRef: toOptionalString(record?.grantSummaryRef),
    setupInstructionsRef: toBrowserSafePayloadReference(record?.setupInstructionsRef),
    installedAtUnixMs: toOptionalInt64String(record?.installedAtUnixMs),
    updatedAtUnixMs: toOptionalInt64String(record?.updatedAtUnixMs),
    grants,
    adapterConnections: extras.adapterConnections ?? [],
    tools: extras.tools ?? [],
    deliveryCapabilityCount: toSafeNumber(definition?.deliveryCapabilityCount),
    cleanupResult: extras.cleanupResult,
  };
}

/** Adapter Connection response を Browser-safe metadata に変換する。 */
export function toBrowserSafeAdapterConnection(
  connection: unknown
): BrowserSafeAdapterConnectionSummary {
  const record = toSafeRecord(connection);
  return {
    connectionId: toSafeString(record?.connectionId),
    installationId: toSafeString(record?.installationId),
    adapterId: toSafeString(record?.adapterId),
    status: toSafeString(record?.status),
    grantSummaryRef: toOptionalString(record?.grantSummaryRef),
    deliveryCapabilityId: toOptionalString(record?.deliveryCapabilityId),
    metadataRef: toBrowserSafePayloadReference(record?.metadataRef),
  };
}

/** Integration uninstall response を Browser-safe cleanup summary に変換する。 */
export function toBrowserSafeCleanupResult(
  response: unknown,
  disabledAdapterConnections: number
): BrowserSafeIntegrationCleanupResult {
  const record = toSafeRecord(response);
  const audit = toSafeRecord(record?.audit);
  return {
    disabledAdapterConnections,
    auditEventId: toOptionalString(audit?.eventId),
    toolsDisabledLabel: 'disabled by Agent cleanup result',
    schedulesCancelledLabel: 'cancelled by Agent cleanup result',
    deliveryRevokedLabel: 'revoked by Agent cleanup result',
    trustKeysRevokedLabel: 'revoked by Agent cleanup result',
  };
}

function toOptionalInt64String(value: unknown): string | undefined {
  const converted = toSafeStringFromInt64(value);
  return converted === '' ? undefined : converted;
}

function buildInputSummary(ref: BrowserSafePayloadReference | undefined): string {
  if (ref === undefined) {
    return 'No input payload reference. Safe projection contains metadata only.';
  }
  const contentType = ref.contentType === '' ? 'unknown type' : ref.contentType;
  const byteSize = ref.byteSize === '' ? '0' : ref.byteSize;
  const digest = ref.sha256 === '' ? '—' : ref.sha256;
  return `metadata only: ${contentType} · ${byteSize} bytes · digest ${digest}`;
}

function deriveRiskLevel(
  status: unknown,
  inputRef: BrowserSafePayloadReference | undefined
): string {
  const normalized = toSafeString(status).toLowerCase();
  if (normalized.includes('pending_approval')) {
    return 'medium';
  }
  if (inputRef !== undefined && inputRef.storageClass !== '') {
    return 'metadata-only';
  }
  return 'low';
}

function toBrowserSafeIntegrationGrant(grant: unknown): BrowserSafeIntegrationGrant {
  const record = toSafeRecord(grant);
  return {
    grantId: toSafeString(record?.grantId),
    grantType: toSafeString(record?.grantType),
    scope: toSafeString(record?.scope),
    status: toSafeString(record?.status),
  };
}
