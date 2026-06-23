using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentSchedule {
  @field(1) schedule_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) status: string;
  @field(5) schedule_spec: string;
  @field(6) thread_key?: string;
  @field(7) installation_id?: string;
  @field(8) overlap_policy: string;
  @field(9) next_fire_at_unix_ms?: int64;
  @field(10) last_fire_at_unix_ms?: int64;
  @field(11) callback_identity?: string;
  @field(12) created_by_principal_id?: string;
  @field(13) created_at_unix_ms: int64;
  @field(14) cancelled_at_unix_ms?: int64;
  @field(15) audit_event_id?: string;
}

@message
model ScheduleFireContext {
  @field(1) schedule_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) tick_id: string;
  @field(5) fire_at_unix_ms: int64;
  @field(6) generated_event_id?: string;
  @field(7) idempotency_key: string;
}
