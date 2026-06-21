using Protobuf;

namespace CfTamac.Agent.V1;

@message
model ThreadCompaction {
  @field(1) compaction_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) section_id: string;
  @field(5) handoff_ref?: string;
}
