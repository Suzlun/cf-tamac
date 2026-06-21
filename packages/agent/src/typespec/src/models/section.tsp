using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentThreadSection {
  @field(1) section_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) section_ordinal: int32;
  @field(5) status: string;
}
