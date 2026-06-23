using Protobuf;

namespace CfTamac.Agent.V1;

@message
model IntegrationInstallation {
  @field(1) installation_id: string;
  @field(2) agent_id: string;
  @field(3) integration_id: string;
  @field(4) status: string;
  @field(5) provider_id?: string;
  @field(6) manifest_ref?: BytePayloadReference;
  @field(7) manifest_digest_sha256?: string;
  @field(8) schema_version?: string;
  @field(9) provider_base_url?: string;
  @field(10) public_key_ref?: string;
  @field(11) grant_summary_ref?: string;
  @field(12) setup_instructions_ref?: BytePayloadReference;
  @field(13) installed_at_unix_ms?: int64;
  @field(14) updated_at_unix_ms?: int64;
}

@message
model IntegrationDefinition {
  @field(1) integration_id: string;
  @field(2) provider_id: string;
  @field(3) display_name: string;
  @field(4) schema_version: string;
  @field(5) manifest_ref?: BytePayloadReference;
  @field(6) adapter_count: int32;
  @field(7) tool_count: int32;
  @field(8) delivery_capability_count: int32;
}

@message
model IntegrationGrant {
  @field(1) grant_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id: string;
  @field(4) grant_type: string;
  @field(5) scope: string;
  @field(6) status: string;
  @field(7) created_at_unix_ms: int64;
}

@message
model InstallationTrustKey {
  @field(1) trust_key_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id: string;
  @field(4) key_id: string;
  @field(5) public_key_ref: string;
  @field(6) status: string;
  @field(7) created_at_unix_ms: int64;
  @field(8) revoked_at_unix_ms?: int64;
}
