using Protobuf;

namespace CfTamac.Agent.V1;

@message
model ThreadHistoryResult {
  @field(1) history_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) history_ref: string;
}
