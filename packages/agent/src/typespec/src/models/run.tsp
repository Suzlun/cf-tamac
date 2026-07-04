using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentRun {
  @field(1) run_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) status: string;
  @field(5) run_input_id?: string;
  @field(6) snapshot_ref?: string;
  @field(7) trigger_event_id?: string;
  @field(8) section_id?: string;
  @field(9) pending_since_unix_ms?: int64;
  @field(10) started_at_unix_ms?: int64;
  @field(11) finished_at_unix_ms?: int64;
  @field(12) config_version?: string;
  @field(13) tool_set_version?: string;
  @field(14) integration_version?: string;
  @field(15) interrupt_reason?: string;
  @field(16) safe_error?: RpcErrorDetail;
  @field(17) model_policy_snapshot?: RunModelPolicySnapshot;
  @field(18) model_invocation_summary?: AgentModelInvocationSummary;
  @field(19) decision_schema_version?: string;
  @field(20) failure_category?: string;
}

@message
model AgentRunInput {
  @field(1) run_input_id: string;
  @field(2) run_id: string;
  @field(3) agent_id: string;
  @field(4) thread_id: string;
  @field(5) trigger_event_id: string;
  @field(6) snapshot_ref?: string;
  @field(7) trigger_start_thread_sequence: int64;
  @field(8) trigger_end_thread_sequence: int64;
  @field(9) thread_memory_version?: string;
  @field(10) latest_ready_compaction_id?: string;
  @field(11) uncompacted_upper_thread_sequence?: int64;
  @field(12) config_version: string;
  @field(13) tool_set_version?: string;
  @field(14) integration_installation_version?: string;
  @field(15) state_snapshot_ref?: string;
  @field(16) model_policy_snapshot?: RunModelPolicySnapshot;
  @field(17) model_invocation_summary?: AgentModelInvocationSummary;
}

@message
model RunSnapshotReference {
  @field(1) snapshot_ref: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) run_id: string;
  @field(5) created_at_unix_ms: int64;
  @field(6) digest_sha256: string;
  @field(7) model_policy_digest?: string;
  @field(8) decision_schema_version?: string;
}
