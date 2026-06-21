using Protobuf;

namespace CfTamac.Agent.V1;

@message
model AdapterConnection {
  @field(1) connection_id: string;
  @field(2) agent_id: string;
  @field(3) installation_id: string;
  @field(4) adapter_id: string;
  @field(5) status: string;
}

@message
model AdapterDeliveryResult {
  @field(1) delivery_id: string;
  @field(2) status: string;
  @field(3) provider_message?: string;
}
