import 'server-only';

import type { ManagedAgentRecord } from '../db';
import type { ServerAgentRpcClients } from './create-client';
import type { ApprovedAgentRpcOrigin } from './origin-policy';

const DEFAULT_POLICY_REF = 'workers-ai-default';
const DEFAULT_PROVIDER = 'workers-ai';
const DEFAULT_MODEL_ID = '@cf/meta/llama-3.1-8b-instruct';
const DEFAULT_DECISION_SCHEMA_VERSION = 'v1';
const E2E_RECONCILIATION_REGISTRATION_PREFIX = 'e2e-reconciliation-';
const E2E_RECONCILIATION_POLICY_REF = 'workers-ai-reconciliation';
const E2E_UNCONFIRMED_POLICY_REF = 'workers-ai-e2e-unconfirmed';
const e2ePolicyReconciliationAgentIds = new Set<string>();
const e2eInitializedAgentStates = new Map<
  string,
  {
    readonly displayName: string;
    readonly policyRef: string;
    readonly idempotencyKey: string;
    readonly registrationRequestDigest: string;
  }
>();

/**
 * Playwright E2E 用の Agent RPC fake を使うかどうかを判定します。
 *
 * @returns 明示的な `E2E_FAKE_AGENT_RPC=1` があり、かつ production runtime ではない場合だけ `true` を返します。
 * @remarks
 * この判定は server-only module 内でだけ使います。Management Client の Browser bundle へ Agent RPC client、
 * credential material、fake response 構築 logic を露出させないため、Playwright webServer の環境変数を唯一の入口にします。
 * production では常に無効化され、実 Agent RPC と credential 解決の fail-closed 経路を維持します。
 *
 * @example
 * ```ts
 * if (isE2eFakeAgentRpcEnabled()) {
 *   return createE2eFakeAgentRpcClients('agent-alpha');
 * }
 * ```
 */
export function isE2eFakeAgentRpcEnabled(): boolean {
  const environment = process.env;
  return environment.E2E_FAKE_AGENT_RPC === '1' && environment.NODE_ENV !== 'production';
}

/**
 * Playwright E2E が外部 Agent Worker なしで Management Client UI を検証するための server-only fake clients を作成します。
 *
 * @param agentId - fake response の Agent scope に固定する Agent ID です。
 * @param managedAgent - Client D1 から読んだ registry metadata です。表示名や RPC origin の safe metadata にだけ使います。
 * @returns Server Action が呼ぶ Agent RPC method shape を持つ fake client bundle です。
 * @remarks
 * fake は E2E 専用で、Agent-owned policy truth の代替ではありません。Client D1 への registry/credential metadata 書き込みは
 * 通常経路を通し、Agent RPC の外部 network と secret 解決だけを deterministic な safe metadata response へ置き換えます。
 * raw prompt、raw completion、provider credential、Agent credential は生成せず、Browser へ返る値は既存 Server Action の
 * browser-safe mapper を通過します。
 */
export function createE2eFakeAgentRpcClients(
  agentId: string,
  managedAgent?: Pick<ManagedAgentRecord, 'agentRpcOrigin' | 'displayName'>
): ServerAgentRpcClients {
  const displayName = managedAgent?.displayName ?? agentId;
  const reconciliationRegistration = agentId.startsWith(E2E_RECONCILIATION_REGISTRATION_PREFIX);
  const lifecycle = {
    destroyAgent: () => resolveFake({ agentId, status: 'destroyed' }),
    getAgent: async () => {
      const initializedState = e2eInitializedAgentStates.get(agentId);
      const policyRef = reconciliationRegistration
        ? E2E_UNCONFIRMED_POLICY_REF
        : (initializedState?.policyRef ?? DEFAULT_POLICY_REF);
      const resolvedDisplayName = initializedState?.displayName ?? displayName;
      return await resolveFake({
        activeCredential: buildFakeCredential(agentId),
        agent: buildFakeAgent(agentId, resolvedDisplayName),
        capabilitySummary: buildFakeCapabilitySummary(),
        config: buildFakeConfig(agentId, resolvedDisplayName, policyRef),
        defaultModelPolicy: await buildFakePolicy(agentId, { policyRef }),
        initializationReceipt:
          initializedState === undefined
            ? undefined
            : {
                idempotencyKey: initializedState.idempotencyKey,
                registrationRequestDigest: initializedState.registrationRequestDigest,
              },
      });
    },
    initializeAgent: async (request: Record<string, unknown>) => {
      // Client registration reconciliation が照合する profile/config/receipt を fake Agent の server-side state として保持する。
      const initializationReceipt = {
        idempotencyKey: readString(request.idempotencyKey),
        registrationRequestDigest: readString(request.registrationRequestDigest),
      };
      const policy = await buildFakePolicy(agentId, readRecord(request.initialModelPolicy));
      e2eInitializedAgentStates.set(agentId, {
        displayName,
        policyRef: readString(policy.policyRef, DEFAULT_POLICY_REF),
        ...initializationReceipt,
      });
      if (reconciliationRegistration) {
        // E2E の response-loss scenario だけは、Agent profile と異なる config を返して registration reconciliation を継続する。
        throw new Error('E2E registration response is intentionally unavailable.');
      }
      const config = buildFakeConfig(agentId, displayName, readString(policy.policyRef));
      return resolveFake({
        agent: buildFakeAgent(agentId, displayName),
        config,
        defaultModelPolicy: policy,
        initializationReceipt,
      });
    },
    rotateAgentCredential: () =>
      resolveFake({
        credential: buildFakeCredential(agentId, 2),
        previousCredential: buildFakeCredential(agentId, 1),
      }),
  } as unknown as ServerAgentRpcClients['lifecycle'];

  const modelPolicies = {
    archiveModelPolicy: async (request: Record<string, unknown>) =>
      resolveFake({
        policy: {
          ...(await buildFakePolicy(agentId, { policyRef: readString(request.policyRef) })),
          status: 'archived',
        },
      }),
    getModelPolicy: async (request: Record<string, unknown>) =>
      resolveFake({
        policy: await buildFakePolicy(agentId, { policyRef: readString(request.policyRef) }),
      }),
    listModelPolicies: async () =>
      resolveFake({
        page: buildEmptyPage(agentId, 'model-policies'),
        policies: [await buildFakePolicy(agentId, { policyRef: DEFAULT_POLICY_REF })],
      }),
    upsertModelPolicy: async (request: Record<string, unknown>) => {
      const policy = await buildFakePolicy(agentId, readRecord(request.policy));
      return resolveFake({
        policy,
        validation: buildValidation(policy),
      });
    },
    validateModelPolicy: async (request: Record<string, unknown>) => {
      const policy = await buildFakePolicy(agentId, readRecord(request.policy));
      return resolveFake({
        policyPreview: policy,
        validation: buildValidation(policy),
      });
    },
  } as unknown as ServerAgentRpcClients['modelPolicies'];

  const state = {
    getConfig: async () => {
      const initializedState = e2eInitializedAgentStates.get(agentId);
      const policyRef = e2ePolicyReconciliationAgentIds.has(agentId)
        ? E2E_UNCONFIRMED_POLICY_REF
        : (initializedState?.policyRef ?? DEFAULT_POLICY_REF);
      return await resolveFake({
        config: buildFakeConfig(agentId, displayName, policyRef),
        defaultModelPolicy: await buildFakePolicy(agentId, { policyRef }),
      });
    },
    getState: () =>
      resolveFake({
        state: {
          agentId,
          capabilitySummary: buildFakeCapabilitySummary(),
          configVersion: '1',
          lifecycleStatus: 'active',
          schedulerStatus: 'idle',
          stateVersion: '1',
          storageStatus: 'serving',
        },
        storage: { currentPercent: 0 },
      }),
    updateConfig: async (request: Record<string, unknown>) => {
      const configInput = readRecord(request.config);
      const policyRef = readString(configInput?.modelPolicyRef, DEFAULT_POLICY_REF);
      if (policyRef === E2E_RECONCILIATION_POLICY_REF) {
        // update response を未確定にし、以後の GetConfig は desired/previous のどちらにも一致しない値を返す。
        e2ePolicyReconciliationAgentIds.add(agentId);
        throw new Error('E2E model policy update response is intentionally unavailable.');
      }
      return resolveFake({
        config: buildFakeConfig(agentId, displayName, policyRef, '2'),
        defaultModelPolicy: await buildFakePolicy(agentId, { policyRef }),
      });
    },
  } as unknown as ServerAgentRpcClients['state'];

  return {
    // SDK-backed production adapter と同じ public aggregate shape を保ち、E2E action が transport 実装へ依存しないようにします。
    agentRpcOrigin: (managedAgent?.agentRpcOrigin ??
      'https://e2e-fake-agent.invalid') as ApprovedAgentRpcOrigin,
    events: buildEmptyEventClient(agentId),
    health: buildFakeHealthClient(agentId, managedAgent?.agentRpcOrigin),
    integrations: buildEmptyIntegrationClient(agentId),
    lifecycle,
    modelPolicies,
    runs: buildEmptyRunClient(agentId),
    schedules: buildEmptyScheduleClient(agentId),
    state,
    threads: buildEmptyThreadClient(agentId),
    tools: buildEmptyToolClient(agentId),
    // fake でも Browser-safe correlation を持つ invocation shape を返し、production SDK context と同じ read-only seam を維持します。
    invocation: {
      actingUser: { actingUserId: 'e2e-fake-operator' },
      agentId,
      correlationId: `e2e-fake-correlation:${agentId}`,
      requestId: `e2e-fake-request:${agentId}`,
      scopes: ['agent:read'],
    },
    withErrorNormalization: <T>(operation: () => Promise<T>): Promise<T> => operation(),
  };
}

function resolveFake<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

function buildFakeAgent(agentId: string, displayName: string): Record<string, unknown> {
  return {
    agentId,
    configVersion: '1',
    credentialGeneration: 1,
    displayName,
    status: 'active',
  };
}

function buildFakeCredential(agentId: string, generation = 1): Record<string, unknown> {
  return {
    agentId,
    credentialId: `e2e-credential-${generation.toString()}`,
    generation,
    keyId: `e2e-key-${agentId}`.slice(0, 128),
    status: 'active',
  };
}

function buildFakeCapabilitySummary(): Record<string, number> {
  return {
    activeInstallationCount: 0,
    activeScheduleCount: 0,
    adapterConnectionCount: 0,
    deliveryCapabilityCount: 0,
    toolCount: 0,
  };
}

function buildFakeConfig(
  agentId: string,
  displayName: string,
  policyRef: string,
  configVersion = '1'
): Record<string, unknown> {
  return {
    agentId,
    configVersion,
    displayName,
    modelPolicyRef: policyRef,
  };
}

async function buildFakePolicy(
  agentId: string,
  input: Record<string, unknown> | undefined
): Promise<Record<string, unknown>> {
  const policyRef = readString(input?.policyRef, DEFAULT_POLICY_REF);
  const provider = readString(input?.provider, DEFAULT_PROVIDER);
  const modelId = readString(input?.modelId, DEFAULT_MODEL_ID);
  const decisionSchemaVersion = readString(
    input?.decisionSchemaVersion,
    DEFAULT_DECISION_SCHEMA_VERSION
  );
  const generationParameters = readGenerationParameters(input);
  const safeMetadataRef = await buildInlineSafeMetadataRef(
    policyRef,
    provider,
    modelId,
    generationParameters
  );
  return {
    agentId,
    decisionSchemaVersion,
    modelId,
    policyDigest: `sha256:${await sha256Hex(
      new TextEncoder().encode(`${agentId}:${policyRef}:${provider}:${modelId}`)
    )}`,
    policyRef,
    provider,
    safeGenerationParametersRef: safeMetadataRef,
    safeMetadataRef,
    status: 'active',
    version: '1',
  };
}

function buildValidation(policy: Record<string, unknown>): Record<string, unknown> {
  const issues = buildValidationIssues(policy);
  const ok = issues.length === 0;
  return {
    issues,
    ok,
    policyDigest: ok ? policy.policyDigest : undefined,
    policyRef: policy.policyRef,
    warnings: [],
  };
}

function buildValidationIssues(
  policy: Record<string, unknown>
): readonly Record<string, unknown>[] {
  const issues: Record<string, unknown>[] = [];
  if (policy.decisionSchemaVersion !== DEFAULT_DECISION_SCHEMA_VERSION) {
    issues.push({
      code: 'unsupported_decision_schema',
      retryable: false,
      safeMessage: 'Only decision schema version v1 is supported.',
      severity: 'error',
      target: 'decision_schema_version',
    });
  }
  if (policy.provider !== DEFAULT_PROVIDER) {
    issues.push({
      code: 'unsupported_provider',
      retryable: false,
      safeMessage: 'Only workers-ai provider is supported.',
      severity: 'error',
      target: 'provider',
    });
  }
  if (typeof policy.modelId !== 'string' || !policy.modelId.startsWith('@cf/')) {
    issues.push({
      code: 'unsupported_model',
      retryable: false,
      safeMessage: 'Workers AI model_id must use an @cf/ model.',
      severity: 'error',
      target: 'model_id',
    });
  }
  return issues;
}

function readGenerationParameters(
  input: Record<string, unknown> | undefined
): Record<string, string> {
  const generationPayload = readInlineJsonObject(input?.generationParametersRef);
  const safeMetadata = readInlineJsonObject(input?.safeMetadataRef);
  const nestedGeneration = readRecord(safeMetadata?.generationParameters);
  const source = generationPayload ?? nestedGeneration;
  return {
    maxOutputTokens: readString(source?.maxOutputTokens, '1024'),
    temperature: readString(source?.temperature, '0.20'),
    topP: readString(source?.topP, '0.90'),
  };
}

async function buildInlineSafeMetadataRef(
  policyRef: string,
  provider: string,
  modelId: string,
  generationParameters: Record<string, string>
): Promise<Record<string, unknown>> {
  const payload = {
    generationParameters,
    model: modelId,
    policyRef,
    provider,
  };
  const canonical = JSON.stringify(payload);
  const inlineBytes = new TextEncoder().encode(canonical);
  return {
    byteSize: BigInt(inlineBytes.byteLength),
    contentType: 'application/json; charset=utf-8',
    inlineBytes,
    ref: `e2e-model-policy-safe:${policyRef}`,
    sha256: await sha256Hex(inlineBytes),
    storageClass: 'inline-safe-json',
  };
}

function readInlineJsonObject(value: unknown): Record<string, unknown> | undefined {
  const record = readRecord(value);
  if (!(record?.inlineBytes instanceof Uint8Array)) {
    return undefined;
  }
  try {
    return readRecord(JSON.parse(new TextDecoder().decode(record.inlineBytes)) as unknown);
  } catch {
    return undefined;
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeIdSuffix(value: unknown): string {
  const normalized = readString(value, 'id').replaceAll(/[^\dA-Za-z-]+/g, '-');
  const suffix = normalized.slice(0, 8);
  return suffix !== '' ? suffix : 'id';
}

function buildEmptyPage(agentId: string, resource: string): Record<string, unknown> {
  return {
    cursorScope: `agent:${agentId}:${resource}`,
    resultCount: 0,
  };
}

function buildEmptyThreadClient(agentId: string): ServerAgentRpcClients['threads'] {
  return {
    getLatestCompaction: () => resolveFake({}),
    getThread: (request: Record<string, unknown>) =>
      resolveFake({
        thread: {
          agentId,
          status: 'active',
          threadId: readString(request.threadId, 'e2e-thread'),
          threadKey: 'e2e-thread',
        },
      }),
    getThreadMemory: () => resolveFake({}),
    listSections: () => resolveFake({ page: buildEmptyPage(agentId, 'sections'), sections: [] }),
    listThreads: () => resolveFake({ page: buildEmptyPage(agentId, 'threads'), threads: [] }),
    searchThreadHistory: () =>
      resolveFake({ history: [], page: buildEmptyPage(agentId, 'history') }),
  } as unknown as ServerAgentRpcClients['threads'];
}

function buildEmptyEventClient(agentId: string): ServerAgentRpcClients['events'] {
  return {
    getEvent: () => resolveFake({}),
    listEvents: () => resolveFake({ events: [], page: buildEmptyPage(agentId, 'events') }),
    publishEvent: () => resolveFake({ event: undefined, run: undefined }),
  } as unknown as ServerAgentRpcClients['events'];
}

function buildEmptyRunClient(agentId: string): ServerAgentRpcClients['runs'] {
  return {
    cancelRun: (request: Record<string, unknown>) =>
      resolveFake({
        run: { agentId, runId: readString(request.runId), status: 'cancelled' },
      }),
    getRun: (request: Record<string, unknown>) =>
      resolveFake({
        run: { agentId, runId: readString(request.runId), status: 'completed' },
      }),
    listRuns: () => resolveFake({ page: buildEmptyPage(agentId, 'runs'), runs: [] }),
  } as unknown as ServerAgentRpcClients['runs'];
}

function buildEmptyScheduleClient(agentId: string): ServerAgentRpcClients['schedules'] {
  return {
    cancelSchedule: (request: Record<string, unknown>) =>
      resolveFake({
        schedule: { agentId, scheduleId: readString(request.scheduleId), status: 'cancelled' },
      }),
    createSchedule: (request: Record<string, unknown>) =>
      resolveFake({
        schedule: {
          agentId,
          scheduleId: `e2e-schedule-${safeIdSuffix(request.idempotencyKey)}`,
          status: 'active',
        },
      }),
    getSchedule: () => resolveFake({}),
    listSchedules: () => resolveFake({ page: buildEmptyPage(agentId, 'schedules'), schedules: [] }),
  } as unknown as ServerAgentRpcClients['schedules'];
}

function buildEmptyToolClient(agentId: string): ServerAgentRpcClients['tools'] {
  return {
    approveInvocation: (request: Record<string, unknown>) =>
      resolveFake({
        invocation: {
          agentId,
          invocationId: readString(request.invocationId),
          status: 'approved',
        },
      }),
    getInvocation: (request: Record<string, unknown>) =>
      resolveFake({
        invocation: {
          agentId,
          invocationId: readString(request.invocationId),
          status: 'pending',
        },
      }),
    listInvocations: () =>
      resolveFake({
        invocations: [],
        page: buildEmptyPage(agentId, 'tool-invocations'),
      }),
    listTools: () => resolveFake({ page: buildEmptyPage(agentId, 'tools'), tools: [] }),
    rejectInvocation: (request: Record<string, unknown>) =>
      resolveFake({
        invocation: {
          agentId,
          invocationId: readString(request.invocationId),
          status: 'rejected',
        },
      }),
  } as unknown as ServerAgentRpcClients['tools'];
}

function buildEmptyIntegrationClient(agentId: string): ServerAgentRpcClients['integrations'] {
  return {
    createAdapterConnection: (request: Record<string, unknown>) =>
      resolveFake({
        connection: { agentId, connectionId: readString(request.connectionId), status: 'active' },
      }),
    deleteAdapterConnection: () => resolveFake({ cleanup: { status: 'deleted' } }),
    getInstallation: (request: Record<string, unknown>) =>
      resolveFake({
        installation: {
          agentId,
          installationId: readString(request.installationId),
          status: 'active',
        },
      }),
    installIntegration: (request: Record<string, unknown>) =>
      resolveFake({
        installation: {
          agentId,
          installationId: readString(request.integrationId),
          status: 'active',
        },
      }),
    listAdapterConnections: () =>
      resolveFake({
        connections: [],
        page: buildEmptyPage(agentId, 'adapter-connections'),
      }),
    listInstallations: () =>
      resolveFake({
        installations: [],
        page: buildEmptyPage(agentId, 'installations'),
      }),
    uninstallIntegration: () => resolveFake({ cleanup: { status: 'uninstalled' } }),
  } as unknown as ServerAgentRpcClients['integrations'];
}

function buildFakeHealthClient(
  agentId: string,
  agentRpcOrigin: string | undefined
): ServerAgentRpcClients['health'] {
  return {
    check: () =>
      resolveFake({
        agentId,
        checkedAtUnixMs: BigInt(Date.now()),
        currentPrincipalTrust: {
          fingerprint: `sha256:e2e-${agentId}`,
          issuer: 'cf-tamac-client',
          keyStatus: 'active',
          kid: `e2e-key-${safeIdSuffix(agentId)}`,
          verified: true,
          verifiedAtUnixMs: BigInt(Date.now()),
        },
        modelExecution: {
          bindingPresent: true,
          origin: agentRpcOrigin,
          status: 'serving',
        },
        serviceVersion: 'e2e-fake',
        status: 'serving',
        trustConfig: {
          fingerprint: `sha256:e2e-trust-${safeIdSuffix(agentId)}`,
          loadedAtUnixMs: BigInt(Date.now()),
          status: 'serving',
          version: '1',
        },
      }),
  } as unknown as ServerAgentRpcClients['health'];
}
