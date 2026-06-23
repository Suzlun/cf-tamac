using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentThreadSection {
  @field(1) section_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) section_ordinal: int32;
  @field(5) status: string;
  @field(6) start_thread_sequence: int64;
  @field(7) end_thread_sequence?: int64;
  @field(8) opened_at_unix_ms: int64;
  @field(9) frozen_at_unix_ms?: int64;
  @field(10) latest_compaction_id?: string;
  @field(11) event_count: int32;
}
