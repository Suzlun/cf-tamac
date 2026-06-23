using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentProfile {
  @field(1) agent_id: string;
  @field(2) status: string;
  @field(3) created_at_unix_ms: int64;
  @field(4) updated_at_unix_ms: int64;
  @field(5) display_name?: string;
  @field(6) config_version: string;
  @field(7) credential_generation: int32;
  @field(8) system_thread_id: string;
  @field(9) capability_summary_ref?: string;
  @field(10) latest_audit_event_id?: string;
}

@message
model AgentConfig {
  @field(1) agent_id: string;
  @field(2) config_version: string;
  @field(3) display_name?: string;
  @field(4) model_policy_ref?: string;
  @field(5) budget_policy_ref?: string;
  @field(6) memory_policy_ref?: string;
  @field(7) tool_policy_ref?: string;
  @field(8) schedule_policy_ref?: string;
  @field(9) updated_by_principal_id?: string;
  @field(10) updated_at_unix_ms?: int64;
  @field(11) config_body_ref?: BytePayloadReference;
}

@message
model AgentPrincipal {
  @field(1) principal_id: string;
  @field(2) agent_id: string;
  @field(3) principal_type: string;
  @field(4) display_name?: string;
  @field(5) status: string;
  @field(6) created_at_unix_ms: int64;
  @field(7) updated_at_unix_ms: int64;
}

@message
model AgentGrant {
  @field(1) grant_id: string;
  @field(2) agent_id: string;
  @field(3) principal_id: string;
  @field(4) scope: string;
  @field(5) status: string;
  @field(6) installation_id?: string;
  @field(7) connection_id?: string;
  @field(8) expires_at_unix_ms?: int64;
}

@message
model AgentAuditRecord {
  @field(1) audit_event_id: string;
  @field(2) agent_id: string;
  @field(3) system_thread_id: string;
  @field(4) operation: string;
  @field(5) principal_id: string;
  @field(6) result: string;
  @field(7) occurred_at_unix_ms: int64;
  @field(8) correlation_id?: string;
  @field(9) safe_detail_ref?: string;
}

@message
model AgentCapabilitySummary {
  @field(1) agent_id: string;
  @field(2) tool_count: int32;
  @field(3) active_installation_count: int32;
  @field(4) adapter_connection_count: int32;
  @field(5) active_schedule_count: int32;
  @field(6) delivery_capability_count: int32;
}

@message
model AgentHealthSnapshot {
  @field(1) agent_id: string;
  @field(2) serving_status: string;
  @field(3) service_version: string;
  @field(4) contract_package: string;
  @field(5) checked_at_unix_ms: int64;
  @field(6) dependency_status_ref?: string;
}
