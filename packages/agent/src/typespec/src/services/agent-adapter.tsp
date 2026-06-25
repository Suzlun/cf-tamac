using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface IntegrationIngressService {
  PublishEvent(...PublishIntegrationEventRequest): PublishIntegrationEventResponse;
  PublishToolResult(...PublishToolResultRequest): PublishToolResultResponse;
  PublishDeliveryResult(...PublishDeliveryResultRequest): PublishDeliveryResultResponse;
}

@message
model PublishIntegrationEventRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) thread_key: string;
  @field(4) installation_id: string;
  @field(5) connection_id?: string;
  @field(6) event: AgentEventInput;
  @field(7) timestamp?: RequestTimestamp;
  @field(8) nonce?: NonceMetadata;
  @field(9) raw_body_digest?: RawBodyDigest;
  @field(10) signature?: SignatureMetadata;
}

@message
model PublishIntegrationEventResponse {
  @field(1) event: AgentEvent;
  @field(2) thread: AgentThread;
  @field(3) delivery_context?: DeliveryContext;
  @field(4) replayed: boolean;
  @field(5) requested_model_policy?: AgentModelPolicySummary;
}

@message
model PublishToolResultRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) invocation_id: string;
  @field(5) status: string;
  @field(6) output_ref?: string;
  @field(7) provider_operation_id?: string;
  @field(8) output_payload?: BytePayloadReference;
  @field(9) timestamp?: RequestTimestamp;
  @field(10) nonce?: NonceMetadata;
  @field(11) raw_body_digest?: RawBodyDigest;
  @field(12) signature?: SignatureMetadata;
}

@message
model PublishToolResultResponse {
  @field(1) invocation: ToolInvocation;
  @field(2) result_event?: AgentEvent;
  @field(3) replayed: boolean;
}

@message
model PublishDeliveryResultRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) delivery_id: string;
  @field(5) status: string;
  @field(6) delivery_context_id?: string;
  @field(7) provider_operation_id?: string;
  @field(8) timestamp?: RequestTimestamp;
  @field(9) nonce?: NonceMetadata;
  @field(10) raw_body_digest?: RawBodyDigest;
  @field(11) signature?: SignatureMetadata;
}

@message
model PublishDeliveryResultResponse {
  @field(1) result: AdapterDeliveryResult;
  @field(2) delivery?: AdapterDelivery;
  @field(3) replayed: boolean;
  @field(4) resume_action?: string;
  @field(5) safe_metadata_ref?: BytePayloadReference;
}
