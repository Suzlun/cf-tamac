using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AccessCredential {
  @field(1) credential_id: string;
  @field(2) agent_id: string;
  @field(3) principal_id: string;
  @field(4) status: string;
  @field(5) key_id?: string;
}
