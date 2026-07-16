using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AgentInitializationReceipt {
  @field(1) idempotency_key: string;
  @field(2) registration_request_digest: string;
}
