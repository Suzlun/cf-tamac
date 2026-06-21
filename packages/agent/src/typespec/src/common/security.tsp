using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentScope {
  @field(1) agent_id: string;
}

@message
model PrincipalContext {
  @field(1) principal_id: string;
  @field(2) principal_type: string;
  @field(3) key_id?: string;
}

@message
model ReplayMetadata {
  @field(1) idempotency_key: string;
  @field(2) nonce?: string;
  @field(3) body_sha256?: string;
}

@message
model ThreadKeyValidation {
  @field(1) required: boolean;
  @field(2) normalized_unicode_form: string;
  @field(3) max_utf8_bytes: int32;
  @field(4) case_sensitive: boolean;
  @field(5) implicit_prefix_forbidden: boolean;
}
