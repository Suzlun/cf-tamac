import 'server-only';

import { loadAgentRpcClients } from '../agent-rpc/agent-loader';
import { createBrowserSafeAgentRpcFailure } from '../agent-rpc/safe-results';
import {
  createManagedAgentRegistrationAttemptRepository,
  createManagedAgentRepository,
  type CreateManagedAgentRegistrationAttemptInput as CreateRegistrationLedgerInput,
  type ManagedAgentRegistrationState,
} from '../db';

import { buildAgentModelPolicyInput } from './model-policy-view-models';

import type { NormalizedManagedAgentRegistrationInput } from './managed-agent-registration';
import type { BrowserSafeAgentRpcErrorCategory } from '../agent-rpc/safe-results';

/**
 * create 専用 Agent initialization attempt の入力です。
 *
 * @remarks
 * この input は正規化済み registration metadata と、既定 signing key の公開 identity だけを持ちます。
 * private key、credential secret、JWT、generated RPC response は含まず、D1 commit と server-only RPC 呼び出しの間でだけ使います。
 *
 * @example
 * ```ts
 * await createManagedAgentRegistrationAttempt(env.CLIENT_DB, {
 *   registration,
 *   signing: { issuer: 'client', keyId: 'key-1', publicFingerprint: 'sha256:public' },
 * });
 * ```
 */
export interface CreateManagedAgentRegistrationAttemptRequest {
  readonly registration: NormalizedManagedAgentRegistrationInput;
  readonly signing: {
    readonly issuer: string;
    readonly keyId: string;
    readonly publicFingerprint: string;
  };
}

/**
 * Client registration attempt の server-only execution outcome です。
 *
 * @remarks
 * `active` は ledger と Agent profile/config が確定済み、`failed` は attempt 前 postcondition へ cleanup 済み、
 * `reconciliation_required` は同じ persisted idempotency key で GetAgent 照合を継続する状態です。Browser へ返す際は
 * 呼び出し元が four-field result へ写像し、attempt key/digest は含めません。
 */
export interface ManagedAgentRegistrationAttemptOutcome {
  readonly agentId: string;
  readonly correlationId: string;
  readonly safeErrorCategory: BrowserSafeAgentRpcErrorCategory | null;
  readonly state: ManagedAgentRegistrationState | 'failed';
}

/**
 * managed Agent、credential reference、signing metadata、initialization attempt を原子的に保存し、create 専用で InitializeAgent を実行します。
 *
 * @param d1 - Management Client の `CLIENT_DB` binding です。
 * @param request - 正規化済み registration と active default signing key identity です。
 * @returns active、cleanup 済み failed、または reconciliation_required を示す server-only outcome です。
 * @throws D1 create commit が失敗した場合は送出します。呼び出し元は raw error を Browser-safe failure へ丸めます。
 *
 * @remarks
 * attempt ID、fixed initialization idempotency key、request digest は D1 commit 前に一度だけ生成して永続化します。
 * response loss、timeout、unavailable、active commit failure は GetAgent 照合へ進み、再送で新しい InitializeAgent を発行しません。
 */
export async function createManagedAgentRegistrationAttempt(
  d1: D1Database,
  request: CreateManagedAgentRegistrationAttemptRequest
): Promise<ManagedAgentRegistrationAttemptOutcome> {
  const attempt = await createAttemptMetadata(request.registration);
  const repository = createManagedAgentRegistrationAttemptRepository(d1);
  // 初期化 RPC より先に、全 Client-owned metadata と fixed attempt identity を一つの D1 batch で確定します。
  await repository.createRegistrationAttempt(toRegistrationLedgerInput(request, attempt));
  return await initializeAndReconcileAttempt(d1, request.registration, attempt);
}

/**
 * reconciliation_required の create attempt を、永続化済み key/digest を使って再照合します。
 *
 * @param d1 - Management Client の `CLIENT_DB` binding です。
 * @param agentId - 状態確認する managed Agent ID です。
 * @returns active、cleanup 済み failed、または継続する reconciliation_required outcome です。
 * @throws agent が存在しない、または attempt metadata が欠落している場合に `TypeError` を送出します。
 *
 * @remarks
 * この function は InitializeAgent を呼びません。GetAgent だけで Agent profile/config/default policy の一致を照合し、
 * 固定 idempotency context を失わない状態確認 action を提供します。
 */
export async function reconcileManagedAgentRegistrationAttempt(
  d1: D1Database,
  agentId: string
): Promise<ManagedAgentRegistrationAttemptOutcome> {
  const managedAgent = await createManagedAgentRepository(d1).getManagedAgent(agentId);
  if (
    managedAgent?.registrationState !== 'reconciliation_required' ||
    managedAgent.registrationAttemptId === undefined ||
    managedAgent.initializationIdempotencyKey === undefined ||
    managedAgent.registrationRequestDigest === undefined ||
    managedAgent.registrationModelPolicyRef === undefined
  ) {
    throw new TypeError('Managed Agent registration is not awaiting reconciliation.');
  }
  // D1 に保存した digest/key は request 本文として Browser へ返さず、同一 attempt の照合 identity としてだけ再利用します。
  return await reconcileAttempt(d1, {
    agentId,
    attemptId: managedAgent.registrationAttemptId,
    displayName: managedAgent.displayName,
    initializationIdempotencyKey: managedAgent.initializationIdempotencyKey,
    modelPolicyRef: managedAgent.registrationModelPolicyRef,
    requestDigest: managedAgent.registrationRequestDigest,
  });
}

interface RegistrationAttemptMetadata {
  readonly agentId: string;
  readonly attemptId: string;
  readonly displayName: string;
  readonly initializationIdempotencyKey: string;
  readonly modelPolicyRef: string;
  readonly requestDigest: string;
}

async function initializeAndReconcileAttempt(
  d1: D1Database,
  registration: NormalizedManagedAgentRegistrationInput,
  attempt: RegistrationAttemptMetadata
): Promise<ManagedAgentRegistrationAttemptOutcome> {
  const repository = createManagedAgentRegistrationAttemptRepository(d1);
  try {
    const { clients } = await loadAgentRpcClients(registration.agentId);
    const initialModelPolicy = await buildAgentModelPolicyInput(registration.modelPolicy);
    // Create flow だけが fixed key を使って InitializeAgent を送る。edit flow はこの function を呼ばない。
    const initializationResponse = await clients.withErrorNormalization(() =>
      clients.lifecycle.initializeAgent({
        agentId: registration.agentId,
        idempotencyKey: attempt.initializationIdempotencyKey,
        displayName: registration.displayName,
        initialConfig: {
          agentId: registration.agentId,
          displayName: registration.displayName,
          modelPolicyRef: registration.modelPolicy.policyRef,
        } as never,
        initialModelPolicy: initialModelPolicy as never,
        registrationRequestDigest: attempt.requestDigest,
      })
    );
    // direct response の receipt/profile/config/status も照合し、InitializeAgent が返した別 Agent/context を active と誤認しません。
    if (!matchesRegistrationAttempt(asRecord(initializationResponse) ?? {}, attempt)) {
      return await keepReconciliationRequired(
        repository,
        attempt,
        clients.invocation.correlationId,
        'active_commit',
        'internal'
      );
    }
    // direct response と、同一 server-side invocation で再取得した GetAgent の双方が完全一致した場合だけ active を確定します。
    return await reconcileAttempt(
      d1,
      attempt,
      clients.invocation.correlationId,
      'internal',
      'active_commit'
    );
  } catch (error) {
    const failure = createBrowserSafeAgentRpcFailure(
      error,
      globalThis.crypto.randomUUID(),
      undefined
    );
    // transport response が未確定でも Agent は作成済みかもしれないため、failure category を先に確定して GetAgent で照合します。
    return await reconcileAttempt(d1, attempt, failure.correlationId, failure.safeErrorCategory);
  }
}

async function reconcileAttempt(
  d1: D1Database,
  attempt: RegistrationAttemptMetadata,
  initialCorrelationId = globalThis.crypto.randomUUID(),
  initialCategory: BrowserSafeAgentRpcErrorCategory = 'internal',
  initialPhase?: 'active_commit' | 'cleanup'
): Promise<ManagedAgentRegistrationAttemptOutcome> {
  const repository = createManagedAgentRegistrationAttemptRepository(d1);
  try {
    const { clients } = await loadAgentRpcClients(attempt.agentId);
    // GetAgent は同じ server-side Client bundle で profile/config/default policy を読み、Browser には一致結果だけを返します。
    const response = await clients.withErrorNormalization(() =>
      clients.lifecycle.getAgent({ agentId: attempt.agentId })
    );
    if (matchesRegistrationAttempt(response, attempt)) {
      try {
        await repository.markAttemptActive(attempt.agentId, attempt.attemptId);
        return {
          agentId: attempt.agentId,
          correlationId: clients.invocation.correlationId,
          safeErrorCategory: null,
          state: 'active',
        };
      } catch {
        return await keepReconciliationRequired(
          repository,
          attempt,
          clients.invocation.correlationId,
          'active_commit',
          initialCategory
        );
      }
    }
    // profile/config/receipt の不一致、destroyed、部分応答は Agent 不在を確定できないため cleanup せず確認操作を維持します。
    return await keepReconciliationRequired(
      repository,
      attempt,
      clients.invocation.correlationId,
      'active_commit',
      initialCategory
    );
  } catch (error) {
    const failure = createBrowserSafeAgentRpcFailure(error, initialCorrelationId, undefined);
    if (failure.safeErrorCategory === 'not_found') {
      try {
        // normalized `not_found` は Agent 不在を確定するため、同じ attempt が作った Client ledger と credential reference を
        // 一つの cleanup postcondition へ戻し、次の登録で古い attempt metadata を再利用できない状態にします。
        await repository.cleanupCreatedAttempt(attempt.agentId, attempt.attemptId);
        return {
          agentId: attempt.agentId,
          correlationId: failure.correlationId,
          safeErrorCategory: failure.safeErrorCategory,
          state: 'failed',
        };
      } catch {
        // cleanup 自体が未確定なら row の有無を推測せず、同じ attempt の確認操作だけを残します。
        return await keepReconciliationRequired(
          repository,
          attempt,
          failure.correlationId,
          'cleanup',
          failure.safeErrorCategory
        );
      }
    }
    // timeout、unavailable、internal、receipt/profile の不一致などは Agent 作成有無を断定できないため、
    // Client ledger を reconciliation_required のまま保持し、同じ idempotency context の確認操作へ閉じます。
    return await keepReconciliationRequired(
      repository,
      attempt,
      failure.correlationId,
      initialPhase ?? 'active_commit',
      failure.safeErrorCategory
    );
  }
}

async function keepReconciliationRequired(
  repository: ReturnType<typeof createManagedAgentRegistrationAttemptRepository>,
  attempt: RegistrationAttemptMetadata,
  correlationId: string,
  phase: 'active_commit' | 'cleanup',
  safeErrorCategory: BrowserSafeAgentRpcErrorCategory
): Promise<ManagedAgentRegistrationAttemptOutcome> {
  try {
    // observability record は server-only D1 ledger に限定し、attempt phase と support correlation だけを残します。
    await repository.markAttemptReconciliationRequired({
      agentId: attempt.agentId,
      attemptId: attempt.attemptId,
      correlationId,
      phase,
      safeErrorCategory,
    });
  } catch {
    // observability write 自体の raw failure は Browser へ出さない。元の safe category/correlation で確認 action を継続する。
  }
  return {
    agentId: attempt.agentId,
    correlationId,
    safeErrorCategory,
    state: 'reconciliation_required',
  };
}

function matchesRegistrationAttempt(
  response: Record<string, unknown>,
  attempt: RegistrationAttemptMetadata
): boolean {
  const config = asRecord(response.config);
  const configModelPolicyRef = config?.modelPolicyRef;
  const defaultModelPolicy = asRecord(response.defaultModelPolicy);
  // profile identity、config ref、default policy ref を確認し、同名 Agent の別 configuration を成功と誤認しません。
  // 状態確認 action は plaintext request を保持しないため、persisted digest と一緒に config/default-policy の相互一致も確認します。
  return (
    hasActiveAgentProfile(response, attempt) &&
    typeof configModelPolicyRef === 'string' &&
    configModelPolicyRef !== '' &&
    configModelPolicyRef === attempt.modelPolicyRef &&
    defaultModelPolicy?.policyRef === configModelPolicyRef &&
    asRecord(response.initializationReceipt)?.idempotencyKey ===
      attempt.initializationIdempotencyKey &&
    asRecord(response.initializationReceipt)?.registrationRequestDigest === attempt.requestDigest
  );
}

function hasMatchingAgentProfile(
  response: Record<string, unknown>,
  attempt: RegistrationAttemptMetadata
): boolean {
  const agent = asRecord(response.agent);
  return agent?.agentId === attempt.agentId && agent.displayName === attempt.displayName;
}

function hasActiveAgentProfile(
  response: Record<string, unknown>,
  attempt: RegistrationAttemptMetadata
): boolean {
  const agent = asRecord(response.agent);
  // profile identity だけでは destroyed 等の lifecycle state を active と誤認するため、status を必須条件にします。
  return hasMatchingAgentProfile(response, attempt) && agent?.status === 'active';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

async function createAttemptMetadata(
  registration: NormalizedManagedAgentRegistrationInput
): Promise<RegistrationAttemptMetadata> {
  const attemptId = globalThis.crypto.randomUUID();
  return {
    agentId: registration.agentId,
    attemptId,
    displayName: registration.displayName,
    // timestamp ではなく persisted attempt ID だけから導出し、response-loss reconciliation が同一 command identity を再利用します。
    initializationIdempotencyKey: `registration:${registration.agentId}:${attemptId}`,
    modelPolicyRef: registration.modelPolicy.policyRef,
    requestDigest: await registrationRequestDigest(registration),
  };
}

async function registrationRequestDigest(
  registration: NormalizedManagedAgentRegistrationInput
): Promise<string> {
  // key 順を固定した canonical JSON の非可逆 digest だけを ledger に保存し、credential reference 本文を observability に露出しません。
  const canonical = JSON.stringify({
    agentId: registration.agentId,
    agentRpcOrigin: registration.agentRpcOrigin,
    displayName: registration.displayName,
    displayOrder: registration.displayOrder,
    modelPolicy: registration.modelPolicy,
    credential: {
      keyId: registration.keyId,
      maskedHint: registration.maskedHint,
      publicFingerprint: registration.publicFingerprint,
      referenceValue: registration.referenceValue,
      status: registration.status,
    },
  });
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  );
  // SHA-256 bytes を lower-case hex に固定し、同じ normalized request が同じ secret-free ledger digest になるようにします。
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}

function toRegistrationLedgerInput(
  request: CreateManagedAgentRegistrationAttemptRequest,
  attempt: RegistrationAttemptMetadata
): CreateRegistrationLedgerInput {
  return {
    agent: {
      agentId: request.registration.agentId,
      agentRpcOrigin: request.registration.agentRpcOrigin,
      displayName: request.registration.displayName,
      displayOrder: request.registration.displayOrder,
    },
    attempt: {
      attemptId: attempt.attemptId,
      initializationIdempotencyKey: attempt.initializationIdempotencyKey,
      modelPolicyRef: attempt.modelPolicyRef,
      requestDigest: attempt.requestDigest,
    },
    credential: {
      credentialRef: request.registration.referenceValue,
      keyId: request.registration.keyId,
      publicFingerprint: request.registration.publicFingerprint,
      maskedHint: request.registration.maskedHint,
      status: request.registration.status,
    },
    signing: request.signing,
  };
}
