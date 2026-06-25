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
  @field(2) input?: AgentRunInput;
  @field(3) snapshot?: RunSnapshotReference;
  @field(4) model_policy_snapshot?: RunModelPolicySnapshot;
  @field(5) model_invocation?: AgentModelInvocationSummary;
}

@message
model ListRunsRequest {
  @field(1) agent_id: string;
  @field(2) thread_id?: string;
  @field(3) page?: PageRequest;
  @field(4) status?: string;
  @field(5) time_range?: TimeRange;
}

@message
model ListRunsResponse {
  @field(1) runs: AgentRun[];
  @field(2) page: PageResponse;
  @field(3) model_policies: RunModelPolicySnapshot[];
}

@message
model CancelRunRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) run_id: string;
  @field(4) reason?: string;
  @field(5) security?: SecurityMetadata;
}

@message
model CancelRunResponse {
  @field(1) run: AgentRun;
  @field(2) audit?: AgentAuditRecord;
  @field(3) replayed: boolean;
}
