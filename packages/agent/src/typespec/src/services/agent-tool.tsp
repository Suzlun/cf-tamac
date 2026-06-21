using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentToolService {
  ListTools(...ListToolsRequest): ListToolsResponse;
  GetInvocation(...GetInvocationRequest): GetInvocationResponse;
  ListInvocations(...ListInvocationsRequest): ListInvocationsResponse;
  ApproveInvocation(...ApproveInvocationRequest): ApproveInvocationResponse;
  RejectInvocation(...RejectInvocationRequest): RejectInvocationResponse;
}

@message
model ListToolsRequest {
  @field(1) agent_id: string;
  @field(2) page?: PageRequest;
}

@message
model ListToolsResponse {
  @field(1) tools: AgentTool[];
  @field(2) page: PageResponse;
}

@message
model GetInvocationRequest {
  @field(1) agent_id: string;
  @field(2) invocation_id: string;
}

@message
model GetInvocationResponse {
  @field(1) invocation: ToolInvocation;
}

@message
model ListInvocationsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id?: string;
  @field(3) page?: PageRequest;
}

@message
model ListInvocationsResponse {
  @field(1) invocations: ToolInvocation[];
  @field(2) page: PageResponse;
}

@message
model ApproveInvocationRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) invocation_id: string;
}

@message
model ApproveInvocationResponse {
  @field(1) invocation: ToolInvocation;
}

@message
model RejectInvocationRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) invocation_id: string;
  @field(4) reason?: string;
}

@message
model RejectInvocationResponse {
  @field(1) invocation: ToolInvocation;
}
