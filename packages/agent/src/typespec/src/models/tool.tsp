using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentTool {
  @field(1) tool_id: string;
  @field(2) agent_id: string;
  @field(3) display_name: string;
  @field(4) status: string;
}

@message
model ToolInvocation {
  @field(1) invocation_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) tool_id: string;
  @field(5) status: string;
}
