using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentEventService {
  PublishEvent(...PublishEventRequest): PublishEventResponse;
  GetEvent(...GetEventRequest): GetEventResponse;
  ListEvents(...ListEventsRequest): ListEventsResponse;
}

@message
model PublishEventRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) thread_key: string;
  @field(4) event: AgentEventInput;
  @field(5) security?: SecurityMetadata;
  @field(6) replay?: ReplayMetadata;
}

@message
model PublishEventResponse {
  @field(1) event: AgentEvent;
  @field(2) thread: AgentThread;
  @field(3) accepted: boolean;
  @field(4) pending_run?: AgentRun;
  @field(5) replayed: boolean;
  @field(6) requested_model_policy?: AgentModelPolicySummary;
}

@message
model GetEventRequest {
  @field(1) agent_id: string;
  @field(2) event_id: string;
  @field(3) include_payload: boolean;
}

@message
model GetEventResponse {
  @field(1) event: AgentEvent;
  @field(2) payload?: BytePayloadReference;
}

@message
model ListEventsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
  @field(3) page?: PageRequest;
  @field(4) section_id?: string;
  @field(5) time_range?: TimeRange;
  @field(6) event_type?: string;
}

@message
model ListEventsResponse {
  @field(1) events: AgentEvent[];
  @field(2) page: PageResponse;
}
