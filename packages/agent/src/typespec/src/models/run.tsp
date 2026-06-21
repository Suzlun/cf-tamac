using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentRun {
  @field(1) run_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) status: string;
}

@message
model AgentRunInput {
  @field(1) run_input_id: string;
  @field(2) run_id: string;
  @field(3) agent_id: string;
  @field(4) thread_id: string;
  @field(5) trigger_event_id: string;
  @field(6) snapshot_ref?: string;
}
