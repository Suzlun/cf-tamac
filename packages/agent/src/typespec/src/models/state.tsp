using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentStateSnapshot {
  @field(1) agent_id: string;
  @field(2) state_version: string;
  @field(3) state_ref?: string;
  @field(4) lifecycle_status: string;
  @field(5) current_run_id?: string;
  @field(6) scheduler_status: string;
  @field(7) storage_status: string;
  @field(8) config_version: string;
  @field(9) capability_summary?: AgentCapabilitySummary;
  @field(10) updated_at_unix_ms: int64;
}

@message
model StorageThresholdStatus {
  @field(1) agent_id: string;
  @field(2) inline_payload_limit_bytes: int64;
  @field(3) warning_percent: int32;
  @field(4) compaction_priority_percent: int32;
  @field(5) force_large_body_r2_percent: int32;
  @field(6) critical_percent: int32;
  @field(7) current_percent: int32;
}
