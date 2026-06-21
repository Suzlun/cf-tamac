using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentSchedule {
  @field(1) schedule_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) status: string;
  @field(5) schedule_spec: string;
}
