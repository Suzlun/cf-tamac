using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AccessCredential {
  @field(1) credential_id: string;
  @field(2) agent_id: string;
  @field(3) principal_id: string;
  @field(4) status: string;
  @field(5) key_id?: string;
  @field(6) generation: int32;
  @field(7) verifier_material_ref?: string;
  @field(8) public_fingerprint?: string;
  @field(9) secret_reference?: string;
  @field(10) created_at_unix_ms: int64;
  @field(11) overlap_until_unix_ms?: int64;
  @field(12) revoked_at_unix_ms?: int64;
  @field(13) audit_event_id?: string;
}

@message
model CredentialRotationPolicy {
  @field(1) agent_id: string;
  @field(2) requested_generation: int32;
  @field(3) overlap_seconds: int32;
  @field(4) revoke_previous: boolean;
  @field(5) verifier_material_ref?: string;
  @field(6) public_fingerprint?: string;
}
