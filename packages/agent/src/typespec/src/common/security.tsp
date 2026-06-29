using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentScope {
  @field(1) agent_id: string;
  @field(2) aggregate_identity: string;
}

@message
model PrincipalContext {
  @field(1) principal_id: string;
  @field(2) principal_type: string;
  @field(3) key_id?: string;
  @field(4) issuer?: string;
  @field(5) subject?: string;
  @field(6) jwt_id?: string;
  @field(7) audience?: string;
  @field(8) acting_user_id?: string;
  @field(9) scopes: string[];
}

/**
 * Agent Worker が読み込んだ control-plane trust config の安全な診断情報です。
 * version と fingerprint は運用者が設定反映を照合するための識別子だけを表し、公開鍵本文や秘密鍵 material は含めません。
 * loaded_at_unix_ms は Agent Worker が設定を検証済みとして保持し始めた時刻を Unix epoch milliseconds で示します。
 * status は serving / degraded / unavailable など、health 応答で secret-free に表示できる設定状態を入れるための文字列です。
 * issuer_count と key_count は構成規模の要約であり、issuer/key の完全な設定内容を返さないための集約値です。
 */
@message
model TrustConfigDiagnostic {
  /** trust config schema または運用設定の version を示す安全な識別子です。 */
  @field(1) version: string;

  /** trust config 全体を公開情報だけから計算した fingerprint です。 */
  @field(2) fingerprint: string;

  /** Agent Worker が trust config を読み込み検証した Unix epoch milliseconds です。 */
  @field(3) loaded_at_unix_ms: int64;

  /** health 応答で利用する trust config の診断状態です。 */
  @field(4) status: string;

  /** trust config に含まれる issuer 数の集約値です。 */
  @field(5) issuer_count: int32;

  /** trust config に含まれる Ed25519 public key 数の集約値です。 */
  @field(6) key_count: int32;
}

/**
 * 認証済み Client Service principal が提示した issuer / kid / fingerprint の検証済み要約です。
 * Agent health 応答はこの情報により、選択中の Client 署名鍵が Agent trust config 上で active または retiring として受理されたかを確認できます。
 * fingerprint は公開鍵の安全な識別子だけを返し、public JWK 全文、JWT 本文、signature、private JWK、暗号化済み private JWK は返しません。
 * verified_at_unix_ms は認証 interceptor が当該 issuer/kid/fingerprint を検証した時刻を Unix epoch milliseconds で表します。
 */
@message
model AuthenticatedPrincipalTrustSummary {
  /** JWT payload の iss として検証された issuer です。 */
  @field(1) issuer: string;

  /** JWT header の kid として検証された key id です。 */
  @field(2) kid: string;

  /** trust config 上の公開鍵 fingerprint と照合済みの安全な識別子です。 */
  @field(3) fingerprint: string;

  /** active / retiring など、trust config 上の key lifecycle 状態です。 */
  @field(4) key_status: string;

  /** client_service など、認証済み principal の種別です。 */
  @field(5) principal_type: string;

  /** issuer/kid/fingerprint が trust config と一致し、署名検証まで完了したかを示します。 */
  @field(6) verified: boolean;

  /** この要約を生成した検証時刻の Unix epoch milliseconds です。 */
  @field(7) verified_at_unix_ms: int64;
}

@message
model ReplayMetadata {
  @field(1) idempotency_key: string;
  @field(2) nonce?: string;
  @field(3) body_sha256?: string;
  @field(4) request_timestamp_unix_ms?: int64;
  @field(5) principal_id?: string;
  @field(6) recorded_response_ref?: string;
}

@message
model ThreadKeyValidation {
  @field(1) required: boolean;
  @field(2) normalized_unicode_form: string;
  @field(3) max_utf8_bytes: int32;
  @field(4) case_sensitive: boolean;
  @field(5) implicit_prefix_forbidden: boolean;
  @field(6) empty_forbidden: boolean;
  @field(7) identity_rule: string;
}

@message
model RequestTimestamp {
  @field(1) unix_ms: int64;
  @field(2) accepted_skew_ms: int64;
  @field(3) source: string;
}

@message
model NonceMetadata {
  @field(1) nonce: string;
  @field(2) principal_id: string;
  @field(3) ttl_seconds: int32;
  @field(4) first_seen_unix_ms?: int64;
}

@message
model IdempotencyMetadata {
  @field(1) idempotency_key: string;
  @field(2) principal_id: string;
  @field(3) body_sha256: string;
  @field(4) replay_policy: string;
  @field(5) recorded_response_ref?: string;
}

@message
model RawBodyDigest {
  @field(1) algorithm: string;
  @field(2) digest_hex: string;
  @field(3) byte_length: int64;
}

@message
model SignatureMetadata {
  @field(1) key_id: string;
  @field(2) algorithm: string;
  @field(3) signature: bytes;
  @field(4) signed_at_unix_ms: int64;
  @field(5) service: string;
  @field(6) method: string;
}

@message
model SecurityMetadata {
  @field(1) principal: PrincipalContext;
  @field(2) timestamp?: RequestTimestamp;
  @field(3) nonce?: NonceMetadata;
  @field(4) idempotency?: IdempotencyMetadata;
  @field(5) raw_body_digest?: RawBodyDigest;
  @field(6) signature?: SignatureMetadata;
}

@message
model BytePayloadReference {
  @field(1) ref: string;
  @field(2) content_type: string;
  @field(3) byte_size: int64;
  @field(4) sha256: string;
  @field(5) storage_class: string;
  @field(6) inline_bytes?: bytes;
}
