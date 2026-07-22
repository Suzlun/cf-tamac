import 'server-only';

/**
 * Registration create flow が D1 に保存する secret-free attempt metadata です。
 *
 * @remarks
 * `initializationIdempotencyKey` と request digest は Client server-only flow だけが読み、Browser や Agent-domain
 * snapshot へ渡しません。入力は managed Agent/credential/signing metadata の原子的な保存単位を表します。
 *
 * @example
 * ```ts
 * await repository.createRegistrationAttempt({
 *   agent: { agentId: 'agent-alpha', agentRpcOrigin: 'https://agent.example.com', displayName: 'Alpha', displayOrder: 0 },
 *   credential: { credentialRef: 'opaque-ref', keyId: 'key-1', publicFingerprint: 'sha256:public', maskedHint: 'ed25519:ab…12', status: 'active' },
 *   signing: { issuer: 'client', keyId: 'key-1', publicFingerprint: 'sha256:signing' },
 *   attempt: { attemptId: 'attempt-1', initializationIdempotencyKey: 'registration:agent-alpha:attempt-1', requestDigest: 'sha256:…' },
 * });
 * ```
 */
export interface CreateManagedAgentRegistrationAttemptInput {
  readonly agent: {
    readonly agentId: string;
    readonly agentRpcOrigin: string;
    readonly displayName: string;
    readonly displayOrder: number;
  };
  readonly credential: {
    readonly credentialRef: string;
    readonly keyId: string;
    readonly publicFingerprint: string;
    readonly maskedHint: string;
    readonly status: string;
  };
  readonly signing: {
    readonly issuer: string;
    readonly keyId: string;
    readonly publicFingerprint: string;
  };
  readonly attempt: {
    readonly attemptId: string;
    readonly initializationIdempotencyKey: string;
    /** GetAgent reconciliation で requested value と厳密一致させる create intent。Agent config snapshot ではない。 */
    readonly modelPolicyRef: string;
    readonly requestDigest: string;
  };
}

/**
 * Edit flow が Agent RPC 初期化を起動せず、Client-owned metadata だけを更新する入力です。
 *
 * @remarks
 * signing metadata と registration attempt metadata は既存 row のまま保持します。credential reference を置換する場合も
 * managed Agent row と credential rows を同じ D1 batch に含め、失敗時に preimage から部分更新が残らないようにします。
 */
export interface UpdateManagedAgentRegistrationInput {
  readonly agent: CreateManagedAgentRegistrationAttemptInput['agent'];
  readonly credential: CreateManagedAgentRegistrationAttemptInput['credential'];
}

/**
 * reconciliation cleanup failure の server-only observability record です。
 *
 * @remarks
 * 値は attempt ID、phase、safe category、secret-free correlation ID だけです。raw error、credential reference、
 * signing material、Agent response body を保存しません。
 */
export interface RegistrationAttemptFailureObservation {
  readonly agentId: string;
  readonly attemptId: string;
  readonly phase: 'active_commit' | 'cleanup';
  readonly safeErrorCategory: string;
  readonly correlationId: string;
}

/**
 * 登録 attempt cleanup の postcondition です。
 *
 * @remarks
 * `deleted` は今回の呼び出しが対象 row を削除した状態、`already_absent` は同じ attempt の別の
 * cleanup が先に完了し、対象 Agent row が既に存在しない状態を示します。どちらも Client 側の
 * 再登録可能状態へ進めます。別 attempt や active row が残る場合は method が例外を送出します。
 */
export type CleanupCreatedAttemptResult = 'deleted' | 'already_absent';

/**
 * Client D1 の登録 attempt 原子操作を提供する repository です。
 *
 * @remarks
 * Cloudflare D1 `batch()` は statement 全体を atomic commit するため、create failure は registration 前、edit failure は
 * managed Agent/credential/signing/attempt metadata の完全な preimage に留まります。Agent RPC や secret resolution は扱いません。
 *
 * @example
 * ```ts
 * const repository = createManagedAgentRegistrationAttemptRepository(env.CLIENT_DB);
 * await repository.markAttemptActive('agent-alpha', 'attempt-1');
 * ```
 */
export interface ManagedAgentRegistrationAttemptRepository {
  readonly createRegistrationAttempt: (
    input: CreateManagedAgentRegistrationAttemptInput
  ) => Promise<void>;
  readonly updateRegistrationMetadata: (
    input: UpdateManagedAgentRegistrationInput
  ) => Promise<void>;
  readonly markAttemptActive: (agentId: string, attemptId: string) => Promise<void>;
  readonly markAttemptReconciliationRequired: (
    observation: RegistrationAttemptFailureObservation
  ) => Promise<void>;
  readonly cleanupCreatedAttempt: (
    agentId: string,
    attemptId: string
  ) => Promise<CleanupCreatedAttemptResult>;
}

/**
 * Client-owned managed Agent registration attempt repository を作成します。
 *
 * @param d1 - Management Client Worker の `CLIENT_DB` binding です。
 * @returns create/edit/attempt-state を atomic D1 batch で更新する repository です。
 * @throws 各 method は D1 constraint または transport failure を送出します。呼び出し元は raw detail を Browser へ返してはなりません。
 *
 * @example
 * ```ts
 * const repository = createManagedAgentRegistrationAttemptRepository(env.CLIENT_DB);
 * await repository.updateRegistrationMetadata(input);
 * ```
 */
export function createManagedAgentRegistrationAttemptRepository(
  d1: D1Database
): ManagedAgentRegistrationAttemptRepository {
  return {
    createRegistrationAttempt: async (input) => {
      await createRegistrationAttempt(d1, input);
    },
    updateRegistrationMetadata: async (input) => {
      await updateRegistrationMetadata(d1, input);
    },
    markAttemptActive: async (agentId, attemptId) => {
      await markAttemptActive(d1, agentId, attemptId);
    },
    markAttemptReconciliationRequired: async (observation) => {
      await markAttemptReconciliationRequired(d1, observation);
    },
    cleanupCreatedAttempt: (agentId, attemptId) => cleanupCreatedAttempt(d1, agentId, attemptId),
  };
}

async function createRegistrationAttempt(
  d1: D1Database,
  input: CreateManagedAgentRegistrationAttemptInput
): Promise<void> {
  assertCreateInput(input);
  const now = Date.now();
  // managed Agent、credential reference、signing metadata、attempt metadata を同一 batch に閉じ、
  // credential statement が失敗しても Agent row だけが残らない create 前 postcondition を保ちます。
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO client_managed_agents (
          agent_id, agent_rpc_origin, display_name, display_order, pinned, created_at_ms, updated_at_ms,
          signing_issuer, signing_key_id, signing_public_fingerprint,
          registration_state, registration_attempt_id, initialization_idempotency_key, registration_request_digest,
          registration_model_policy_ref
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'initializing', ?, ?, ?, ?)`
      )
      .bind(
        input.agent.agentId,
        input.agent.agentRpcOrigin,
        input.agent.displayName,
        input.agent.displayOrder,
        now,
        now,
        input.signing.issuer,
        input.signing.keyId,
        input.signing.publicFingerprint,
        input.attempt.attemptId,
        input.attempt.initializationIdempotencyKey,
        input.attempt.requestDigest,
        input.attempt.modelPolicyRef
      ),
    upsertCredentialStatement(d1, input.agent.agentId, input.credential, now),
  ]);
}

async function updateRegistrationMetadata(
  d1: D1Database,
  input: UpdateManagedAgentRegistrationInput
): Promise<void> {
  assertEditInput(input);
  const now = Date.now();
  // edit は Agent RPC initialize を実行しない。既存 signing/attempt fields を変更せず、Agent metadata と
  // credential reference の置換を一つの atomic batch に含めて部分 rollback を不要にします。
  await d1.batch([
    d1
      .prepare(
        `UPDATE client_managed_agents
         SET agent_rpc_origin = ?, display_name = ?, display_order = ?, updated_at_ms = ?
         WHERE agent_id = ?`
      )
      .bind(
        input.agent.agentRpcOrigin,
        input.agent.displayName,
        input.agent.displayOrder,
        now,
        input.agent.agentId
      ),
    d1
      .prepare(
        `DELETE FROM client_agent_credential_refs
         WHERE agent_id = ? AND credential_ref <> ?`
      )
      .bind(input.agent.agentId, input.credential.credentialRef),
    upsertCredentialStatement(d1, input.agent.agentId, input.credential, now),
  ]);
}

async function markAttemptActive(
  d1: D1Database,
  agentId: string,
  attemptId: string
): Promise<void> {
  assertAttemptIdentity(agentId, attemptId);
  // Agent initialization response と同じ attempt を照合してから active を確定し、別 create attempt の状態を上書きしません。
  const result = await d1
    .prepare(
      `UPDATE client_managed_agents
       SET registration_state = 'active',
           registration_last_failure_phase = NULL,
           registration_last_failure_category = NULL,
           registration_last_failure_correlation_id = NULL,
           updated_at_ms = ?
       WHERE agent_id = ? AND registration_attempt_id = ?`
    )
    .bind(Date.now(), agentId, attemptId)
    .run();
  // attempt 条件に一致しない 0-row update を成功扱いにすると、別 attempt の結果を active と誤認するため fail closed にする。
  assertExactlyOneAffectedRow(result, 'Registration attempt could not be marked active.');
}

async function markAttemptReconciliationRequired(
  d1: D1Database,
  observation: RegistrationAttemptFailureObservation
): Promise<void> {
  assertAttemptIdentity(observation.agentId, observation.attemptId);
  assertObservation(observation);
  // cleanup/active commit の失敗は secret-free operational fields だけを server-only ledger に残し、
  // Browser には固定 copy と correlation ID を持つ reconciliation action だけを返します。
  const result = await d1
    .prepare(
      `UPDATE client_managed_agents
       SET registration_state = 'reconciliation_required',
           registration_last_failure_phase = ?,
           registration_last_failure_category = ?,
           registration_last_failure_correlation_id = ?,
           updated_at_ms = ?
       WHERE agent_id = ?
         AND registration_attempt_id = ?
         AND registration_state <> 'active'`
    )
    .bind(
      observation.phase,
      observation.safeErrorCategory,
      observation.correlationId,
      Date.now(),
      observation.agentId,
      observation.attemptId
    )
    .run();
  // 既に active の attempt を遅延 failure で巻き戻さず、競合で対象を失った場合は caller を安全な未確定へ戻す。
  assertExactlyOneAffectedRow(
    result,
    'Registration attempt could not be marked for reconciliation.'
  );
}

async function cleanupCreatedAttempt(
  d1: D1Database,
  agentId: string,
  attemptId: string
): Promise<CleanupCreatedAttemptResult> {
  assertAttemptIdentity(agentId, attemptId);
  // profile/config が attempt 前状態と一致した場合だけ、その attempt が作成した Agent row を削除します。
  // foreign-key cascade により credential metadata も同じ transaction statement で消え、部分 cleanup を残しません。
  const result = await d1
    .prepare(
      `DELETE FROM client_managed_agents
       WHERE agent_id = ?
         AND registration_attempt_id = ?
         AND registration_state IN ('initializing', 'reconciliation_required')`
    )
    .bind(agentId, attemptId)
    .run();
  if (result.meta.changes === 1) {
    return 'deleted';
  }
  // 並行した同一 attempt の cleanup が先に完了した場合は、row 不在を再読して同じ成功 postcondition とみなします。
  const current = await d1
    .prepare(
      `SELECT registration_attempt_id, registration_state
       FROM client_managed_agents
       WHERE agent_id = ?`
    )
    .bind(agentId)
    .first<{ registration_attempt_id: string | null; registration_state: string }>();
  if (current === null) {
    return 'already_absent';
  }
  // 別 attempt または active row が残る場合は、この呼び出しの cleanup 範囲を越えるため fail closed にします。
  throw new TypeError('Registration attempt could not be cleaned up.');
}

function upsertCredentialStatement(
  d1: D1Database,
  agentId: string,
  credential: CreateManagedAgentRegistrationAttemptInput['credential'],
  now: number
): D1PreparedStatement {
  // credential secret 本体は書き込まず、opaque lookup reference と公開 metadata だけを Agent row と同じ batch に含めます。
  return d1
    .prepare(
      `INSERT INTO client_agent_credential_refs (
        agent_id, credential_ref, key_id, public_fingerprint, masked_hint, status, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, credential_ref) DO UPDATE SET
        key_id = excluded.key_id,
        public_fingerprint = excluded.public_fingerprint,
        masked_hint = excluded.masked_hint,
        status = excluded.status,
        updated_at_ms = excluded.updated_at_ms`
    )
    .bind(
      agentId,
      credential.credentialRef,
      credential.keyId,
      credential.publicFingerprint,
      credential.maskedHint,
      credential.status,
      now,
      now
    );
}

function assertCreateInput(input: CreateManagedAgentRegistrationAttemptInput): void {
  assertEditInput(input);
  assertAttemptIdentity(input.agent.agentId, input.attempt.attemptId);
  if (
    input.attempt.initializationIdempotencyKey.trim() === '' ||
    input.attempt.modelPolicyRef.trim() === '' ||
    input.attempt.requestDigest.trim() === '' ||
    input.signing.issuer.trim() === '' ||
    input.signing.keyId.trim() === '' ||
    input.signing.publicFingerprint.trim() === ''
  ) {
    throw new TypeError('Registration attempt and signing metadata must be non-empty.');
  }
}

function assertEditInput(input: UpdateManagedAgentRegistrationInput): void {
  if (
    input.agent.agentId.trim() === '' ||
    input.agent.agentRpcOrigin.trim() === '' ||
    input.agent.displayName.trim() === '' ||
    input.credential.credentialRef.trim() === '' ||
    input.credential.keyId.trim() === '' ||
    input.credential.publicFingerprint.trim() === '' ||
    input.credential.maskedHint.trim() === '' ||
    input.credential.status.trim() === ''
  ) {
    throw new TypeError('Managed Agent registration metadata must be non-empty.');
  }
}

function assertAttemptIdentity(agentId: string, attemptId: string): void {
  if (agentId.trim() === '' || attemptId.trim() === '') {
    throw new TypeError('Registration attempt identity must be non-empty.');
  }
}

function assertObservation(observation: RegistrationAttemptFailureObservation): void {
  if (observation.safeErrorCategory.trim() === '' || observation.correlationId.trim() === '') {
    throw new TypeError('Registration failure observation must be secret-free and non-empty.');
  }
}

function assertExactlyOneAffectedRow(result: D1Result, failureMessage: string): void {
  // Cloudflare D1 が返す changes を state transition の postcondition として扱い、0-row conditional DML を成功値に変換しない。
  if (result.meta.changes !== 1) {
    throw new TypeError(failureMessage);
  }
}
