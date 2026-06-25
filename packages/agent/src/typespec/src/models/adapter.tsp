using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AdapterConnection {
  @field(1) connection_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id: string;
  @field(4) adapter_id: string;
  @field(5) status: string;
  @field(6) connection_key?: string;
  @field(7) external_subject?: string;
  @field(8) grant_summary_ref?: string;
  @field(9) delivery_capability_id?: string;
  @field(10) created_at_unix_ms: int64;
  @field(11) disabled_at_unix_ms?: int64;
  @field(12) metadata_ref?: BytePayloadReference;
  @field(13) allowed_model_policy_refs: string[];
  @field(14) model_policy_grant_ref?: BytePayloadReference;
}

@message
model AdapterDeliveryResult {
  @field(1) delivery_id: string;
  @field(2) status: string;
  @field(3) provider_message?: string;
  @field(4) agent_id?: string;
  @field(5) installation_id?: string;
  @field(6) connection_id?: string;
  @field(7) delivery_context_id?: string;
  @field(8) provider_operation_id?: string;
  @field(9) run_id?: string;
  @field(10) decision_id?: string;
  @field(11) resume_action?: string;
  @field(12) safe_metadata_ref?: BytePayloadReference;
}

@message
model AdapterDefinition {
  @field(1) adapter_id: string;
  @field(2) integration_id: string;
  @field(3) display_name: string;
  @field(4) ingress_grant: string;
  @field(5) delivery_capability_id?: string;
  @field(6) schema_ref?: BytePayloadReference;
}

@message
model DeliveryContext {
  @field(1) delivery_context_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id: string;
  @field(4) connection_id: string;
  @field(5) event_id: string;
  @field(6) thread_id: string;
  @field(7) capability: string;
  @field(8) status: string;
  @field(9) created_at_unix_ms: int64;
  @field(10) expires_at_unix_ms?: int64;
  @field(11) metadata_ref?: BytePayloadReference;
  @field(12) model_policy_ref?: string;
  @field(13) model_policy_digest?: string;
}

@message
model AdapterDelivery {
  @field(1) delivery_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id: string;
  @field(4) connection_id: string;
  @field(5) delivery_context_id: string;
  @field(6) run_id?: string;
  @field(7) event_id?: string;
  @field(8) status: string;
  @field(9) request_payload?: BytePayloadReference;
  @field(10) request_digest?: RawBodyDigest;
  @field(11) provider_operation_id?: string;
  @field(12) created_at_unix_ms: int64;
  @field(13) updated_at_unix_ms: int64;
}
