using Protobuf;

namespace CfTamac.Agent.V1;

@message
model IntegrationInstallation {
  @field(1) installation_id: string;
  @field(2) agent_id: string;
  @field(3) integration_id: string;
  @field(4) status: string;
}
