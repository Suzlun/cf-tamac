using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentEvent {
  @field(1) event_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) section_id: string;
  @field(5) event_type: string;
  @field(6) payload_ref?: string;
  @field(7) thread_key: string;
  @field(8) normalized_thread_key: string;
  @field(9) source: string;
  @field(10) agent_sequence: int64;
  @field(11) thread_sequence: int64;
  @field(12) occurred_at_unix_ms: int64;
  @field(13) idempotency_key?: string;
  @field(14) payload_metadata?: BytePayloadReference;
  @field(15) correlation_id?: string;
  @field(16) causation_id?: string;
  @field(17) run_id?: string;
  @field(18) delivery_context_id?: string;
  @field(19) requested_model_policy_ref?: string;
  @field(20) model_policy?: AgentModelPolicySummary;
  @field(21) model_policy_validation?: AgentModelPolicyValidationResult;
  @field(22) policy_override_source?: string;
}

@message
model AgentEventInput {
  @field(1) thread_key: string;
  @field(2) event_type: string;
  @field(3) source: string;
  @field(4) payload_content_type?: string;
  @field(5) payload?: bytes;
  @field(6) payload_reference?: BytePayloadReference;
  @field(7) occurred_at_unix_ms?: int64;
  @field(8) correlation_id?: string;
  @field(9) causation_id?: string;
  @field(10) delivery_context?: DeliveryContext;
  @field(11) model_policy_ref?: string;
}
