using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentStateService {
  GetState(...GetStateRequest): GetStateResponse;
  GetConfig(...GetConfigRequest): GetConfigResponse;
  UpdateConfig(...UpdateConfigRequest): UpdateConfigResponse;
}

@message
model GetStateRequest {
  @field(1) agent_id: string;
}

@message
model GetStateResponse {
  @field(1) state: AgentStateSnapshot;
}

@message
model GetConfigRequest {
  @field(1) agent_id: string;
}

@message
model GetConfigResponse {
  @field(1) config: AgentConfig;
}

@message
model UpdateConfigRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) config: AgentConfig;
}

@message
model UpdateConfigResponse {
  @field(1) config: AgentConfig;
}
