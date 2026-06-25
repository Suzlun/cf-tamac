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
  @field(4) initial_config?: AgentConfig;
  @field(5) credential_policy?: CredentialRotationPolicy;
  @field(6) security?: SecurityMetadata;
  @field(7) initial_model_policy?: AgentModelPolicyInput;
}

@message
model InitializeAgentResponse {
  @field(1) agent: AgentProfile;
  @field(2) config?: AgentConfig;
  @field(3) credential?: AccessCredential;
  @field(4) audit?: AgentAuditRecord;
  @field(5) thread_key_rule?: ThreadKeyIdentityRule;
  @field(6) default_model_policy?: AgentModelPolicySummary;
}

@message
model GetAgentRequest {
  @field(1) agent_id: string;
}

@message
model GetAgentResponse {
  @field(1) agent: AgentProfile;
  @field(2) config?: AgentConfig;
  @field(3) active_credential?: AccessCredential;
  @field(4) capability_summary?: AgentCapabilitySummary;
  @field(5) default_model_policy?: AgentModelPolicySummary;
}

@message
model DestroyAgentRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) reason?: string;
  @field(4) security?: SecurityMetadata;
}

@message
model DestroyAgentResponse {
  @field(1) status: OperationStatus;
  @field(2) agent?: AgentProfile;
  @field(3) audit?: AgentAuditRecord;
}

@message
model RotateAgentCredentialRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) credential_id: string;
  @field(4) policy?: CredentialRotationPolicy;
  @field(5) security?: SecurityMetadata;
}

@message
model RotateAgentCredentialResponse {
  @field(1) credential: AccessCredential;
  @field(2) previous_credential?: AccessCredential;
  @field(3) audit?: AgentAuditRecord;
}
