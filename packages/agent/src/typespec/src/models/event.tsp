using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentEvent {
  @field(1) event_id: string;
  @field(2) agent_id: string;
  @field(3) thread_id: string;
  @field(4) section_id: string;
  @field(5) event_type: string;
  @field(6) payload_ref?: string;
}

@message
model AgentEventInput {
  @field(1) thread_key: string;
  @field(2) event_type: string;
  @field(3) source: string;
  @field(4) payload_content_type?: string;
  @field(5) payload?: bytes;
}
