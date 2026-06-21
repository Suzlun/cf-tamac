using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentProfile {
  @field(1) agent_id: string;
  @field(2) status: string;
  @field(3) created_at_unix_ms: int64;
  @field(4) updated_at_unix_ms: int64;
}

@message
model AgentConfig {
  @field(1) agent_id: string;
  @field(2) config_version: string;
  @field(3) display_name?: string;
}
