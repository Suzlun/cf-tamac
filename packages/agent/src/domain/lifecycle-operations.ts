import { createThreadKeyIdentity } from '../threads';

import {
  agentSystemThreadKey,
  assertAgentContext,
  authorizeAgentOperation,
  checkAgentIdempotency,
  createEmptyCapabilitySummary,
  mapAgentCredentialRow,
  mapAgentProfileRow,
  recordAgentIdempotency,
  reserveAgentNonce,
  requireAgentIdempotencyKey,
} from './agent-operation-utils';
import { createAgentDomainError } from './errors';
import { recordLifecycleAudit } from './lifecycle-audit';
import {
  mapAgentModelPolicySummaryRow,
  requireActiveAgentModelPolicy,
  seedInitialAgentModelPolicy,
} from './model-policy-operations';

import type {
  AgentConfigCommandInput,
  AgentConfigView,
  AgentCoreRequestContext,
  AgentCredentialCommandInput,
  AgentCredentialView,
  AgentScopedQuery,
  DestroyAgentCommand,
  DestroyAgentResult,
  GetAgentResult,
  InitializeAgentCommand,
  InitializeAgentResult,
  RotateAgentCredentialCommand,
  RotateAgentCredentialResult,
  UpdateAgentConfigCommand,
  UpdateAgentConfigResult,
} from './agent-core';
import type { AgentConfigRow, AgentProfileRow, AgentStorageRepositories } from '../storage';

/**
 * Run InitializeAgent against Agent-owned storage.
 */
export function initializeAgentInStore(input: {
  readonly agentId: string;
  readonly command: InitializeAgentCommand;
  readonly repositories: AgentStorageRepositories;
}): InitializeAgentResult {
  assertAgentContext(input.agentId, input.command.context);
  // registration_request_digest は Client の登録意図と Agent-owned receipt を結ぶため、全読み書きより先に空値を拒否します。
  const registrationRequestDigest = requireRegistrationRequestDigest(
    input.command.registrationRequestDigest
  );
  const replay = checkAgentIdempotency<InitializeAgentResult>({
    context: input.command.context,
    operationName: 'AgentLifecycleService.InitializeAgent',
    repositories: input.repositories,
  });
  if (replay.status === 'replay') {
    // replay 応答と永続receiptの両方を照合し、片方だけが別の登録意図を示す状態を返さないようにします。
    assertReplayInitializationReceipt({
      idempotencyKey: requireAgentIdempotencyKey(input.command.context),
      registrationRequestDigest,
      response: replay.response,
      storedReceipt: input.repositories.initializationReceipt.getReceipt(),
    });
    return { ...replay.response, replayed: true };
  }
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeAgentOperation({
    action: 'agent.initialize',
    allowMissingProfile: true,
    context: input.command.context,
    method: 'InitializeAgent',
    repositories: input.repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: ['agent.rpc', 'agent.lifecycle'],
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  if (input.repositories.profile.getProfile() !== undefined) {
    throw createAgentDomainError({ kind: 'conflict', message: 'Agent is already initialized.' });
  }
  if (input.repositories.initializationReceipt.getReceipt() !== undefined) {
    throw createAgentDomainError({
      kind: 'concurrency',
      message: 'Agent initialization receipt already exists without an active profile.',
    });
  }
  // Agent profile/config/credential/audit、初期化receipt、idempotency responseを同一SQLite transactionで確定します。
  const result = input.repositories.transaction((repositories) => {
    // profile/config/credential/audit/thread/model policy とreceiptを同一transaction内で確定します。
    const initialized = createInitializedAgent({
      ...input,
      registrationRequestDigest,
      repositories,
    });
    repositories.initializationReceipt.upsertReceipt({
      createdAtMs: input.command.context.requestedAtMs,
      idempotencyKey: requireAgentIdempotencyKey(input.command.context),
      registrationRequestDigest,
    });
    // receipt repository のpostcondition検証後にだけ、同一transactionへreplay応答を書き込みます。
    recordAgentIdempotency({
      context: input.command.context,
      operationName: 'AgentLifecycleService.InitializeAgent',
      repositories,
      response: initialized,
    });
    return initialized;
  });
  return result;
}

/**
 * Run GetAgent against Agent-owned storage.
 */
export function getAgentFromStore(input: {
  readonly agentId: string;
  readonly query: AgentScopedQuery;
  readonly repositories: AgentStorageRepositories;
}): GetAgentResult {
  assertAgentContext(input.agentId, input.query.context);
  const profile = authorizeAgentOperation({
    action: 'agent.get',
    context: input.query.context,
    method: 'GetAgent',
    repositories: input.repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: ['agent.rpc', 'agent.read'],
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  if (profile === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent not found.' });
  const config = getLatestConfigView(input.agentId, input.repositories);
  // initialized profileにreceiptが欠落している場合は、登録照合不能な成功応答を返さずfail closedします。
  const initializationReceipt = requireInitializationReceipt(input.repositories);
  return {
    activeCredential: mapOptionalCredential(input.agentId, input.repositories, input.query.context),
    agent: mapAgentProfileRow(profile),
    capabilitySummary: createEmptyCapabilitySummary(input.agentId),
    config,
    defaultModelPolicy: config.defaultModelPolicy,
    initializationReceipt,
  };
}

function requireInitializationReceipt(repositories: AgentStorageRepositories) {
  // receiptをAgent-owned SQLiteから読み、profileとのatomic initialization invariantを再確認します。
  const receipt = repositories.initializationReceipt.getReceipt();
  if (receipt === undefined) {
    throw createAgentDomainError({
      kind: 'internal',
      message: 'Initialization receipt is missing for an initialized Agent.',
    });
  }
  return {
    idempotencyKey: receipt.idempotencyKey,
    registrationRequestDigest: receipt.registrationRequestDigest,
  };
}

function requireRegistrationRequestDigest(registrationRequestDigest: string): string {
  // 空白だけのdigestは照合証拠にならないため、入力値の前後を変更せず空白判定だけを行います。
  if (registrationRequestDigest.trim() === '') {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'registration_request_digest must not be empty.',
    });
  }
  return registrationRequestDigest;
}

function assertReplayInitializationReceipt(input: {
  readonly idempotencyKey: string;
  readonly registrationRequestDigest: string;
  readonly response: InitializeAgentResult;
  readonly storedReceipt:
    | { readonly idempotencyKey: string; readonly registrationRequestDigest: string }
    | undefined;
}): void {
  // 永続receiptが欠落している場合はatomicity違反としてfail closedし、active確定に使える応答を返しません。
  if (input.storedReceipt === undefined) {
    throw createAgentDomainError({
      kind: 'internal',
      message: 'Initialization receipt is missing for an idempotent replay.',
    });
  }
  // 同一keyの別digestは既存idempotency contractと同じconflictとして拒否します。
  if (
    input.storedReceipt.idempotencyKey !== input.idempotencyKey ||
    input.storedReceipt.registrationRequestDigest !== input.registrationRequestDigest
  ) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Initialization receipt does not match the requested registration command.',
    });
  }
  // responseRef側も同じreceiptを持つことを確認し、storageとreplay応答の乖離を隠しません。
  if (
    input.response.initializationReceipt.idempotencyKey !== input.idempotencyKey ||
    input.response.initializationReceipt.registrationRequestDigest !==
      input.registrationRequestDigest
  ) {
    throw createAgentDomainError({
      kind: 'internal',
      message: 'Idempotent replay response does not match the initialization receipt.',
    });
  }
}

/**
 * Run DestroyAgent against Agent-owned storage.
 */
export function destroyAgentInStore(input: {
  readonly agentId: string;
  readonly command: DestroyAgentCommand;
  readonly repositories: AgentStorageRepositories;
}): DestroyAgentResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<DestroyAgentResult>({
    context: input.command.context,
    operationName: 'AgentLifecycleService.DestroyAgent',
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  const profile = authorizeAgentOperation({
    action: 'agent.destroy',
    context: input.command.context,
    method: 'DestroyAgent',
    repositories: input.repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR'],
    requiredScopes: ['agent.rpc', 'agent.lifecycle'],
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  if (profile === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent not found.' });
  const now = input.command.context.requestedAtMs;
  input.repositories.profile.upsertProfile({
    configVersion: profile.configVersion,
    credentialGeneration: profile.credentialGeneration,
    displayName: profile.displayName ?? undefined,
    lifecycleStatus: 'destroyed',
    nowMs: now,
    systemThreadId: profile.systemThreadId ?? undefined,
  });
  const updated = requireProfile(input.repositories);
  const audit = recordLifecycleAudit(input, 'agent.lifecycle.destroyed', 'destroyed');
  const result = {
    agent: mapAgentProfileRow(updated),
    audit,
    outcome: 'destroyed',
    replayed: false,
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName: 'AgentLifecycleService.DestroyAgent',
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/**
 * Run RotateAgentCredential against Agent-owned storage.
 */
export function rotateAgentCredentialInStore(input: {
  readonly agentId: string;
  readonly command: RotateAgentCredentialCommand;
  readonly repositories: AgentStorageRepositories;
}): RotateAgentCredentialResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<RotateAgentCredentialResult>({
    context: input.command.context,
    operationName: 'AgentLifecycleService.RotateAgentCredential',
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  const profile = authorizeLifecycleMutation(input, 'credential.rotate', 'RotateAgentCredential');
  const previous = input.repositories.credentials.findCredentialByGeneration(
    profile.credentialGeneration
  );
  const credential = insertRotatedCredential(
    input.repositories,
    input.command.context,
    input.command.credential
  );
  updatePreviousCredential(
    input.repositories,
    previous,
    input.command.context,
    input.command.credential
  );
  input.repositories.profile.upsertProfile({
    configVersion: profile.configVersion,
    credentialGeneration: input.command.credential.generation,
    displayName: profile.displayName ?? undefined,
    lifecycleStatus: profile.lifecycleStatus,
    nowMs: input.command.context.requestedAtMs,
    systemThreadId: profile.systemThreadId ?? undefined,
  });
  const audit = recordLifecycleAudit(input, 'agent.credential.rotated', 'succeeded');
  const result = {
    audit,
    credential: mapAgentCredentialRow(input.agentId, credential),
    previousCredential:
      previous === undefined ? undefined : mapAgentCredentialRow(input.agentId, previous),
    replayed: false,
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName: 'AgentLifecycleService.RotateAgentCredential',
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/**
 * Run UpdateConfig against Agent-owned storage.
 */
export function updateAgentConfigInStore(input: {
  readonly agentId: string;
  readonly command: UpdateAgentConfigCommand;
  readonly repositories: AgentStorageRepositories;
}): UpdateAgentConfigResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<UpdateAgentConfigResult>({
    context: input.command.context,
    operationName: 'AgentStateService.UpdateConfig',
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  const profile = authorizeLifecycleMutation(input, 'config.update', 'UpdateConfig');
  const nextConfig = insertConfig(
    input.repositories,
    input.command.context,
    profile.configVersion + 1,
    mergeConfigWithLatest(input.agentId, input.repositories, input.command.config)
  );
  input.repositories.profile.upsertProfile({
    configVersion: nextConfig.configVersion,
    credentialGeneration: profile.credentialGeneration,
    displayName: nextConfig.displayName ?? profile.displayName ?? undefined,
    lifecycleStatus: profile.lifecycleStatus,
    nowMs: input.command.context.requestedAtMs,
    systemThreadId: profile.systemThreadId ?? undefined,
  });
  const result = {
    audit: recordLifecycleAudit(input, 'agent.config.updated', 'succeeded'),
    config: mapAgentConfigView(input.agentId, input.repositories, nextConfig),
    replayed: false,
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName: 'AgentStateService.UpdateConfig',
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/**
 * Run GetConfig against Agent-owned storage.
 */
export function getAgentConfigFromStore(input: {
  readonly agentId: string;
  readonly query: AgentScopedQuery;
  readonly repositories: AgentStorageRepositories;
}): AgentConfigView {
  assertAgentContext(input.agentId, input.query.context);
  authorizeAgentOperation({
    action: 'config.get',
    context: input.query.context,
    method: 'GetConfig',
    repositories: input.repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: ['agent.rpc', 'agent.read'],
    service: 'cftamac.agent.v1.AgentStateService',
  });
  return getLatestConfigView(input.agentId, input.repositories);
}

function createInitializedAgent(input: {
  readonly agentId: string;
  readonly command: InitializeAgentCommand;
  readonly registrationRequestDigest: string;
  readonly repositories: AgentStorageRepositories;
}): InitializeAgentResult {
  const now = input.command.context.requestedAtMs;
  const systemThreadId = createSystemThread(input.repositories, input.agentId, now);
  const defaultModelPolicy = seedInitialAgentModelPolicy({
    agentId: input.agentId,
    context: input.command.context,
    policy: input.command.initialModelPolicy,
    repositories: input.repositories,
  });
  const initialConfig = createInitialConfigWithPolicyRef(
    input.command.initialConfig,
    defaultModelPolicy.policyRef
  );
  requireActiveAgentModelPolicy({
    agentId: input.agentId,
    policyRef: initialConfig.modelPolicyRef,
    repositories: input.repositories,
  });
  const config = insertConfig(input.repositories, input.command.context, 1, initialConfig);
  const credential = insertRotatedCredential(
    input.repositories,
    input.command.context,
    input.command.credential
  );
  seedPrincipal(input.repositories, input.command.context);
  input.repositories.profile.upsertProfile({
    configVersion: 1,
    credentialGeneration: credential.generation,
    displayName: input.command.displayName,
    lifecycleStatus: 'active',
    nowMs: now,
    systemThreadId,
  });
  const audit = recordLifecycleAudit(input, 'agent.lifecycle.initialized', 'succeeded');
  const agent = mapAgentProfileRow(requireProfile(input.repositories));
  const threadKeyRule = {
    normalizedThreadKey: agentSystemThreadKey,
    threadKey: agentSystemThreadKey,
  };
  return {
    agent,
    audit,
    config: mapAgentConfigView(input.agentId, input.repositories, config),
    credential: mapAgentCredentialRow(input.agentId, credential),
    defaultModelPolicy,
    initializationReceipt: {
      idempotencyKey: requireAgentIdempotencyKey(input.command.context),
      registrationRequestDigest: input.registrationRequestDigest,
    },
    replayed: false,
    threadKeyRule,
  };
}

function authorizeLifecycleMutation(
  input: {
    readonly command: { readonly context: AgentCoreRequestContext };
    readonly repositories: AgentStorageRepositories;
  },
  action: string,
  method: string
) {
  const profile = authorizeAgentOperation({
    action,
    context: input.command.context,
    method,
    repositories: input.repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR'],
    requiredScopes: ['agent.rpc', 'agent.lifecycle'],
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  if (profile === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent not found.' });
  return profile;
}

function createSystemThread(
  repositories: AgentStorageRepositories,
  agentId: string,
  now: number
): string {
  const identity = createThreadKeyIdentity(agentId, agentSystemThreadKey);
  const existing = repositories.threads.findByNormalizedThreadKey(identity.normalizedThreadKey);
  if (existing !== undefined) return existing.threadId;
  const threadId = crypto.randomUUID();
  repositories.threads.insertThread({
    threadId,
    threadKey: identity.threadKey,
    normalizedThreadKey: identity.normalizedThreadKey,
    nowMs: now,
  });
  const sectionId = crypto.randomUUID();
  repositories.sections.insertSection({
    createdAtMs: now,
    sectionId,
    sequence: 1,
    startThreadSequence: 1,
    status: 'active',
    threadId,
  });
  repositories.threads.updateCurrentSection({ currentSectionId: sectionId, nowMs: now, threadId });
  return threadId;
}

function insertConfig(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  configVersion: number,
  config: AgentConfigCommandInput
) {
  repositories.config.insertConfigVersion({
    ...config,
    configVersion,
    updatedAtMs: context.requestedAtMs,
    updatedByPrincipalId: context.principal.principalId,
  });
  const row = repositories.config.findConfigVersion(configVersion);
  if (row === undefined)
    throw createAgentDomainError({ kind: 'internal', message: 'Config write failed.' });
  return row;
}

function insertRotatedCredential(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  credential: AgentCredentialCommandInput
) {
  repositories.credentials.insertCredential({
    credentialId: credential.credentialId,
    generation: credential.generation,
    notBeforeMs: context.requestedAtMs,
    nowMs: context.requestedAtMs,
    publicFingerprint: credential.publicFingerprint,
    status: 'active',
    verifierRef: credential.verifierMaterialRef,
  });
  const row = repositories.credentials.findCredential(credential.credentialId);
  if (row === undefined)
    throw createAgentDomainError({ kind: 'internal', message: 'Credential write failed.' });
  return row;
}

function updatePreviousCredential(
  repositories: AgentStorageRepositories,
  previous: { readonly credentialId: string } | undefined,
  context: AgentCoreRequestContext,
  credential: AgentCredentialCommandInput
): void {
  if (previous === undefined) return;
  if (credential.revokePrevious === true || credential.overlapSeconds === 0) {
    repositories.credentials.updateCredentialStatus({
      credentialId: previous.credentialId,
      nowMs: context.requestedAtMs,
      revokedAtMs: context.requestedAtMs,
      status: 'revoked',
    });
    return;
  }
  repositories.credentials.updateCredentialStatus({
    credentialId: previous.credentialId,
    expiresAtMs: context.requestedAtMs + (credential.overlapSeconds ?? 300) * 1000,
    nowMs: context.requestedAtMs,
    status: 'overlap',
  });
}

function seedPrincipal(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext
): void {
  repositories.principals.upsertPrincipal({
    nowMs: context.requestedAtMs,
    principalId: context.principal.principalId,
    principalType: context.principal.principalType,
    status: 'active',
  });
  for (const scope of context.principal.scopes) {
    repositories.grants.upsertGrant({
      capability: scope,
      grantId: `${context.principal.principalId}:${scope}`,
      nowMs: context.requestedAtMs,
      principalId: context.principal.principalId,
      status: 'active',
    });
  }
}

function getLatestConfigView(
  agentId: string,
  repositories: AgentStorageRepositories
): AgentConfigView {
  const config = repositories.config.getLatestConfig();
  if (config === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent config not found.' });
  return mapAgentConfigView(agentId, repositories, config);
}

function createInitialConfigWithPolicyRef(
  config: AgentConfigCommandInput,
  defaultPolicyRef: string
): AgentConfigCommandInput {
  return { ...config, modelPolicyRef: config.modelPolicyRef ?? defaultPolicyRef };
}

function mergeConfigWithLatest(
  agentId: string,
  repositories: AgentStorageRepositories,
  config: AgentConfigCommandInput
): AgentConfigCommandInput {
  const latest = repositories.config.getLatestConfig();
  const merged = {
    budgetPolicyRef: config.budgetPolicyRef ?? latest?.budgetPolicyRef ?? undefined,
    configBodyRef: config.configBodyRef ?? latest?.configBodyRef ?? undefined,
    displayName: config.displayName ?? latest?.displayName ?? undefined,
    memoryPolicyRef: config.memoryPolicyRef ?? latest?.memoryPolicyRef ?? undefined,
    modelPolicyRef: config.modelPolicyRef ?? latest?.modelPolicyRef ?? undefined,
    schedulePolicyRef: config.schedulePolicyRef ?? latest?.schedulePolicyRef ?? undefined,
    toolPolicyRef: config.toolPolicyRef ?? latest?.toolPolicyRef ?? undefined,
  };
  requireActiveAgentModelPolicy({
    agentId,
    policyRef: merged.modelPolicyRef,
    repositories,
  });
  return merged;
}

function mapAgentConfigView(
  agentId: string,
  repositories: AgentStorageRepositories,
  row: AgentConfigRow
): AgentConfigView {
  const defaultModelPolicy = mapDefaultPolicyForConfig(agentId, repositories, row.modelPolicyRef);
  return {
    agentId,
    budgetPolicyRef: row.budgetPolicyRef ?? undefined,
    configBodyRef: row.configBodyRef ?? undefined,
    configVersion: row.configVersion,
    defaultModelPolicy,
    displayName: row.displayName ?? undefined,
    memoryPolicyRef: row.memoryPolicyRef ?? undefined,
    modelPolicyRef: row.modelPolicyRef ?? undefined,
    modelPolicyValidation: mapModelPolicyValidationForConfig(
      agentId,
      repositories,
      row.modelPolicyRef
    ),
    schedulePolicyRef: row.schedulePolicyRef ?? undefined,
    toolPolicyRef: row.toolPolicyRef ?? undefined,
    updatedAtMs: row.updatedAtMs,
    updatedByPrincipalId: row.updatedByPrincipalId ?? undefined,
  };
}

function mapDefaultPolicyForConfig(
  agentId: string,
  repositories: AgentStorageRepositories,
  policyRef: string | null | undefined
) {
  if (policyRef === null || policyRef === undefined || policyRef === '') return undefined;
  const policy = repositories.modelPolicies.getPolicy(policyRef);
  return policy === undefined ? undefined : mapAgentModelPolicySummaryRow(agentId, policy);
}

function mapModelPolicyValidationForConfig(
  agentId: string,
  repositories: AgentStorageRepositories,
  policyRef: string | null | undefined
): AgentConfigView['modelPolicyValidation'] {
  if (policyRef === null || policyRef === undefined || policyRef === '') return undefined;
  const policy = repositories.modelPolicies.getActivePolicy(policyRef);
  if (policy === undefined) {
    return {
      issues: [
        {
          code: 'model_policy_inactive',
          retryable: false,
          safeMessage: 'Configured model policy ref is not active for this Agent.',
          severity: 'error',
          target: 'model_policy_ref',
        },
      ],
      modelId: '',
      ok: false,
      policyRef,
      provider: '',
      status: 'invalid',
      warnings: [],
    };
  }
  return {
    checkedAtMs: policy.validatedAtMs ?? undefined,
    issues: [],
    modelId: policy.modelId,
    ok: true,
    policyDigest: policy.policyDigest,
    policyRef: policy.policyRef,
    provider: policy.provider,
    safeMetadataRef: mapAgentModelPolicySummaryRow(agentId, policy).safeMetadataRef,
    status: 'active',
    warnings: [],
  };
}

function mapOptionalCredential(
  agentId: string,
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext
): AgentCredentialView | undefined {
  const credential = repositories.credentials.findActiveCredential(context.requestedAtMs);
  return credential === undefined ? undefined : mapAgentCredentialRow(agentId, credential);
}

function requireProfile(repositories: AgentStorageRepositories): AgentProfileRow {
  const profile = repositories.profile.getProfile();
  if (profile === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent not found.' });
  return profile;
}
