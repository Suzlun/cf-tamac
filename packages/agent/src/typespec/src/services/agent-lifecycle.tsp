using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentLifecycleService {
  InitializeAgent(...InitializeAgentRequest): InitializeAgentResponse;
  GetAgent(...GetAgentRequest): GetAgentResponse;
  DestroyAgent(...DestroyAgentRequest): DestroyAgentResponse;
  RotateAgentCredential(...RotateAgentCredentialRequest): RotateAgentCredentialResponse;
}

@message
model InitializeAgentRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) display_name?: string;
}

@message
model InitializeAgentResponse {
  @field(1) agent: AgentProfile;
}

@message
model GetAgentRequest {
  @field(1) agent_id: string;
}

@message
model GetAgentResponse {
  @field(1) agent: AgentProfile;
}

@message
model DestroyAgentRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
}

@message
model DestroyAgentResponse {
  @field(1) status: OperationStatus;
}

@message
model RotateAgentCredentialRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) credential_id: string;
}

@message
model RotateAgentCredentialResponse {
  @field(1) credential: AccessCredential;
}
