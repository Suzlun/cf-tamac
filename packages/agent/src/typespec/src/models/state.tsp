using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentStateSnapshot {
  @field(1) agent_id: string;
  @field(2) state_version: string;
  @field(3) state_ref?: string;
}
