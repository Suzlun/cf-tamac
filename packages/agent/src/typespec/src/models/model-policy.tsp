using Protobuf;

namespace CfTamac.Agent.V1;

// Agent-owned model policy の公開契約は、参照可能な安全 metadata だけを返します。
// provider credential、raw prompt、raw completion、raw reasoning は schema に載せません。
@message
model AgentModelPolicyInput {
  @field(1) policy_ref: string;
  @field(2) provider: string;
  @field(3) model_id: string;
  @field(4) status?: string;
  @field(5) decision_schema_version: string;
  @field(6) generation_parameters_ref?: BytePayloadReference;
  @field(7) budget_metadata_ref?: BytePayloadReference;
  @field(8) safety_metadata_ref?: BytePayloadReference;
  @field(9) credential_reference?: string;
  @field(10) safe_metadata_ref?: BytePayloadReference;
  @field(11) expected_policy_digest?: string;
}

@message
model AgentModelPolicy {
  @field(1) agent_id: string;
  @field(2) policy_ref: string;
  @field(3) version: int64;
  @field(4) status: string;
  @field(5) provider: string;
  @field(6) model_id: string;
  @field(7) decision_schema_version: string;
  @field(8) policy_digest: string;
  @field(9) safe_generation_parameters_ref?: BytePayloadReference;
  @field(10) safe_budget_metadata_ref?: BytePayloadReference;
  @field(11) safe_safety_metadata_ref?: BytePayloadReference;
  @field(12) safe_metadata_ref?: BytePayloadReference;
  @field(13) created_by_principal_id?: string;
  @field(14) updated_by_principal_id?: string;
  @field(15) created_at_unix_ms: int64;
  @field(16) updated_at_unix_ms: int64;
  @field(17) archived_at_unix_ms?: int64;
}

@message
model AgentModelPolicySummary {
  @field(1) agent_id: string;
  @field(2) policy_ref: string;
  @field(3) version: int64;
  @field(4) status: string;
  @field(5) provider: string;
  @field(6) model_id: string;
  @field(7) policy_digest: string;
  @field(8) decision_schema_version: string;
  @field(9) safe_metadata_ref?: BytePayloadReference;
  @field(10) validated_at_unix_ms?: int64;
}

@message
model AgentModelPolicyValidationResult {
  @field(1) ok: boolean;
  @field(2) status: string;
  @field(3) policy_ref: string;
  @field(4) provider: string;
  @field(5) model_id: string;
  @field(6) policy_digest?: string;
  @field(7) issues: ModelPolicyValidationIssue[];
  @field(8) warnings: ModelPolicyValidationIssue[];
  @field(9) safe_metadata_ref?: BytePayloadReference;
  @field(10) checked_at_unix_ms?: int64;
}

@message
model ModelPolicyValidationIssue {
  @field(1) code: string;
  @field(2) severity: string;
  @field(3) target?: string;
  @field(4) safe_message: string;
  @field(5) retryable: boolean;
}

@message
model RunModelPolicySnapshot {
  @field(1) requested_policy_ref?: string;
  @field(2) resolved_policy_ref: string;
  @field(3) resolved_policy_digest: string;
  @field(4) provider: string;
  @field(5) model_id: string;
  @field(6) policy_version: int64;
  @field(7) policy_source: string;
  @field(8) decision_schema_version: string;
  @field(9) config_version: string;
  @field(10) tool_catalog_generation?: string;
  @field(11) integration_capability_generation?: string;
  @field(12) thread_memory_version?: string;
  @field(13) trigger_start_thread_sequence?: int64;
  @field(14) trigger_end_thread_sequence?: int64;
  @field(15) safe_metadata_ref?: BytePayloadReference;
}

@message
model AgentModelInvocationSummary {
  @field(1) invocation_id: string;
  @field(2) run_id: string;
  @field(3) status: string;
  @field(4) provider: string;
  @field(5) model_id: string;
  @field(6) policy_ref: string;
  @field(7) policy_digest: string;
  @field(8) decision_schema_version: string;
  @field(9) request_digest?: RawBodyDigest;
  @field(10) response_digest?: RawBodyDigest;
  @field(11) provider_error_category?: string;
  @field(12) input_token_count?: int64;
  @field(13) output_token_count?: int64;
  @field(14) latency_ms?: int64;
  @field(15) attempt: int32;
  @field(16) safe_metadata_ref?: BytePayloadReference;
}

@message
model ModelExecutionCapability {
  @field(1) status: string;
  @field(2) binding_present: boolean;
  @field(3) provider?: string;
  @field(4) model_id?: string;
  @field(5) default_policy_ref?: string;
  @field(6) default_policy_digest?: string;
  @field(7) checked_at_unix_ms: int64;
  @field(8) last_safe_smoke_ref?: BytePayloadReference;
  @field(9) safe_detail_ref?: string;
}
