using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentThread {
  @field(1) thread_id: string;
  @field(2) agent_id: string;
  @field(3) thread_key: string;
  @field(4) normalized_thread_key: string;
  @field(5) status: string;
  @field(6) current_section_id?: string;
  @field(7) latest_event_id?: string;
  @field(8) latest_run_id?: string;
  @field(9) priority: int32;
  @field(10) created_at_unix_ms: int64;
  @field(11) updated_at_unix_ms: int64;
  @field(12) last_served_at_unix_ms?: int64;
  @field(13) snapshot_ref?: string;
}

@message
model ThreadKeyIdentityRule {
  @field(1) agent_id: string;
  @field(2) thread_key: string;
  @field(3) normalized_thread_key: string;
  @field(4) normalized_unicode_form: string;
  @field(5) max_utf8_bytes: int32;
  @field(6) case_sensitive: boolean;
  @field(7) implicit_prefix_forbidden: boolean;
  @field(8) empty_forbidden: boolean;
}
