using Protobuf;

namespace CfTamac.Agent.V1;

@message
model ThreadHistoryResult {
  @field(1) history_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) history_ref: string;
  @field(5) section_id?: string;
  @field(6) compaction_id?: string;
  @field(7) summary?: string;
  @field(8) body?: BytePayloadReference;
  @field(9) provenance_ref?: string;
  @field(10) created_at_unix_ms?: int64;
}

@message
model ThreadHistoryFilter {
  @field(1) query?: string;
  @field(2) section_id?: string;
  @field(3) compaction_id?: string;
  @field(4) time_range?: TimeRange;
  @field(5) provenance_contains?: string;
}
