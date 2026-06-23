using Protobuf;

namespace CfTamac.Agent.V1;

@message
model ThreadMemory {
  @field(1) memory_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) version: string;
  @field(5) memory_ref?: string;
  @field(6) item_count: int32;
  @field(7) snapshot_ref?: string;
  @field(8) latest_compaction_id?: string;
  @field(9) rebase_status?: string;
  @field(10) updated_at_unix_ms?: int64;
}

@message
model ThreadMemoryItem {
  @field(1) memory_item_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) memory_id: string;
  @field(5) status: string;
  @field(6) content_ref?: BytePayloadReference;
  @field(7) provenance_ref?: string;
  @field(8) supersedes_item_id?: string;
}

@message
model AgentMemory {
  @field(1) memory_id: string;
  @field(2) agent_id: string;
  @field(3) version: string;
  @field(4) status: string;
  @field(5) memory_ref?: string;
  @field(6) item_count: int32;
  @field(7) snapshot_ref?: string;
  @field(8) updated_at_unix_ms?: int64;
}
