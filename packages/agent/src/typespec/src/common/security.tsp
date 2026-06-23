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
