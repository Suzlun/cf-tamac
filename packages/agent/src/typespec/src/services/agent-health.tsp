using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentHealthService {
  Check(...CheckHealthRequest): CheckHealthResponse;
}

@message
model CheckHealthRequest {
  @field(1) agent_id: string;
  @field(2) include_dependencies: boolean;
}

@message
model CheckHealthResponse {
  @field(1) agent_id: string;
  @field(2) status: string;
  @field(3) service_version: string;
  @field(4) contract_package: string;
  @field(5) checked_at_unix_ms: int64;
  @field(6) health?: AgentHealthSnapshot;
  @field(7) dependency_status_ref?: string;
  @field(8) model_execution?: ModelExecutionCapability;
}
