using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentRunService {
  GetRun(...GetRunRequest): GetRunResponse;
  ListRuns(...ListRunsRequest): ListRunsResponse;
  CancelRun(...CancelRunRequest): CancelRunResponse;
}

@message
model GetRunRequest {
  @field(1) agent_id: string;
  @field(2) run_id: string;
}

@message
model GetRunResponse {
  @field(1) run: AgentRun;
}

@message
model ListRunsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id?: string;
  @field(3) page?: PageRequest;
}

@message
model ListRunsResponse {
  @field(1) runs: AgentRun[];
  @field(2) page: PageResponse;
}

@message
model CancelRunRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) run_id: string;
}

@message
model CancelRunResponse {
  @field(1) run: AgentRun;
}
