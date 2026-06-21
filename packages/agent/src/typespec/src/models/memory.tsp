using Protobuf;

namespace CfTamac.Agent.V1;

@message
model ThreadMemory {
  @field(1) memory_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) version: string;
  @field(5) memory_ref?: string;
}
