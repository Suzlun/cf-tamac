using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentThread {
  @field(1) thread_id: string;
  @field(2) agent_id: string;
  @field(3) thread_key: string;
  @field(4) normalized_thread_key: string;
  @field(5) status: string;
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
}
