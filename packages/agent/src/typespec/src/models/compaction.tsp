using Protobuf;

namespace CfTamac.Agent.V1;

@message
model ThreadCompaction {
  @field(1) compaction_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) section_id: string;
  @field(5) handoff_ref?: string;
  @field(6) status: string;
  @field(7) compaction_ordinal: int32;
  @field(8) section_ordinal: int32;
  @field(9) start_thread_sequence: int64;
  @field(10) end_thread_sequence: int64;
  @field(11) history_ref?: string;
  @field(12) memory_delta_ref?: string;
  @field(13) digest_sha256?: string;
  @field(14) started_at_unix_ms?: int64;
  @field(15) completed_at_unix_ms?: int64;
}

@message
model CompactionSnapshotReference {
  @field(1) snapshot_ref: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) compaction_id: string;
  @field(5) section_id: string;
  @field(6) digest_sha256: string;
}
