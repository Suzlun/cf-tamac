using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentModelPolicyService {
  UpsertModelPolicy(...UpsertModelPolicyRequest): UpsertModelPolicyResponse;
  GetModelPolicy(...GetModelPolicyRequest): GetModelPolicyResponse;
  ListModelPolicies(...ListModelPoliciesRequest): ListModelPoliciesResponse;
  ArchiveModelPolicy(...ArchiveModelPolicyRequest): ArchiveModelPolicyResponse;
  ValidateModelPolicy(...ValidateModelPolicyRequest): ValidateModelPolicyResponse;
}

@message
model UpsertModelPolicyRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) policy: AgentModelPolicyInput;
  @field(4) security?: SecurityMetadata;
}

@message
model UpsertModelPolicyResponse {
  @field(1) policy: AgentModelPolicy;
  @field(2) validation: AgentModelPolicyValidationResult;
  @field(3) audit?: AgentAuditRecord;
  @field(4) replayed: boolean;
}

@message
model GetModelPolicyRequest {
  @field(1) agent_id: string;
  @field(2) policy_ref: string;
}

@message
model GetModelPolicyResponse {
  @field(1) policy: AgentModelPolicy;
}

@message
model ListModelPoliciesRequest {
  @field(1) agent_id: string;
  @field(2) page?: PageRequest;
  @field(3) status?: string;
}

@message
model ListModelPoliciesResponse {
  @field(1) policies: AgentModelPolicy[];
  @field(2) page: PageResponse;
}

@message
model ArchiveModelPolicyRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) policy_ref: string;
  @field(4) reason?: string;
  @field(5) security?: SecurityMetadata;
}

@message
model ArchiveModelPolicyResponse {
  @field(1) policy: AgentModelPolicy;
  @field(2) audit?: AgentAuditRecord;
  @field(3) replayed: boolean;
}

@message
model ValidateModelPolicyRequest {
  @field(1) agent_id: string;
  @field(2) policy: AgentModelPolicyInput;
  @field(3) security?: SecurityMetadata;
}

@message
model ValidateModelPolicyResponse {
  @field(1) validation: AgentModelPolicyValidationResult;
  @field(2) policy_preview?: AgentModelPolicySummary;
}
