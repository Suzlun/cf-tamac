using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentTool {
  @field(1) tool_id: string;
  @field(2) agent_id: string;
  @field(3) display_name: string;
  @field(4) status: string;
  @field(5) version: string;
  @field(6) description?: string;
  @field(7) input_schema_ref?: BytePayloadReference;
  @field(8) output_schema_ref?: BytePayloadReference;
  @field(9) approval_required: boolean;
  @field(10) installation_id?: string;
  @field(11) provider_target_ref?: string;
  @field(12) tool_set_version?: string;
}

@message
model ToolInvocation {
  @field(1) invocation_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) tool_id: string;
  @field(5) status: string;
  @field(6) run_id?: string;
  @field(7) installation_id?: string;
  @field(8) idempotency_key?: string;
  @field(9) input_ref?: BytePayloadReference;
  @field(10) output_ref?: BytePayloadReference;
  @field(11) approval_id?: string;
  @field(12) attempt_count: int32;
  @field(13) provider_operation_id?: string;
  @field(14) created_at_unix_ms: int64;
  @field(15) updated_at_unix_ms: int64;
  @field(16) result_event_id?: string;
}

@message
model ToolDefinition {
  @field(1) tool_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id?: string;
  @field(4) version: string;
  @field(5) display_name: string;
  @field(6) description?: string;
  @field(7) input_schema_ref?: BytePayloadReference;
  @field(8) output_schema_ref?: BytePayloadReference;
  @field(9) approval_required: boolean;
  @field(10) status: string;
  @field(11) provider_target_ref?: string;
}

@message
model ToolApproval {
  @field(1) approval_id: string;
  @field(2) agent_id: string;
  @field(3) invocation_id: string;
  @field(4) decision: string;
  @field(5) principal_id: string;
  @field(6) reason?: string;
  @field(7) decided_at_unix_ms: int64;
  @field(8) audit_event_id?: string;
}

@message
model ProviderOperation {
  @field(1) operation_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id: string;
  @field(4) invocation_id?: string;
  @field(5) delivery_id?: string;
  @field(6) status: string;
  @field(7) provider_operation_ref?: string;
  @field(8) request_digest?: RawBodyDigest;
  @field(9) nonce?: string;
  @field(10) timeout_at_unix_ms?: int64;
}
