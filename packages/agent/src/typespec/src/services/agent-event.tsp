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
}

@message
model PublishEventResponse {
  @field(1) event: AgentEvent;
  @field(2) thread: AgentThread;
}

@message
model GetEventRequest {
  @field(1) agent_id: string;
  @field(2) event_id: string;
}

@message
model GetEventResponse {
  @field(1) event: AgentEvent;
}

@message
model ListEventsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id: string;
  @field(3) page?: PageRequest;
}

@message
model ListEventsResponse {
  @field(1) events: AgentEvent[];
  @field(2) page: PageResponse;
}
