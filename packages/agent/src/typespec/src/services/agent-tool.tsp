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
  @field(3) include_unavailable: boolean;
  @field(4) installation_id?: string;
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
  @field(3) include_payload_refs: boolean;
}

@message
model GetInvocationResponse {
  @field(1) invocation: ToolInvocation;
  @field(2) approval?: ToolApproval;
  @field(3) provider_operation?: ProviderOperation;
}

@message
model ListInvocationsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id?: string;
  @field(3) page?: PageRequest;
  @field(4) run_id?: string;
  @field(5) status?: string;
  @field(6) installation_id?: string;
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
  @field(4) reason?: string;
  @field(5) security?: SecurityMetadata;
}

@message
model ApproveInvocationResponse {
  @field(1) invocation: ToolInvocation;
  @field(2) approval?: ToolApproval;
  @field(3) audit?: AgentAuditRecord;
}

@message
model RejectInvocationRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) invocation_id: string;
  @field(4) reason?: string;
  @field(5) security?: SecurityMetadata;
}

@message
model RejectInvocationResponse {
  @field(1) invocation: ToolInvocation;
  @field(2) approval?: ToolApproval;
  @field(3) audit?: AgentAuditRecord;
}
