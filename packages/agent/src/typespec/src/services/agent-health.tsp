using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentHealthService {
  Check(...CheckHealthRequest): CheckHealthResponse;
}

@message
model CheckHealthRequest {
  @field(1) agent_id: string;
}

@message
model CheckHealthResponse {
  @field(1) agent_id: string;
  @field(2) status: string;
  @field(3) service_version: string;
}
