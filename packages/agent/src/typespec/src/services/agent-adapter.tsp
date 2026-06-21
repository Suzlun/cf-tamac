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
}

@message
model PublishIntegrationEventResponse {
  @field(1) event: AgentEvent;
  @field(2) thread: AgentThread;
}

@message
model PublishToolResultRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) invocation_id: string;
  @field(5) status: string;
  @field(6) output_ref?: string;
}

@message
model PublishToolResultResponse {
  @field(1) invocation: ToolInvocation;
}

@message
model PublishDeliveryResultRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) delivery_id: string;
  @field(5) status: string;
}

@message
model PublishDeliveryResultResponse {
  @field(1) result: AdapterDeliveryResult;
}
