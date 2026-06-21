using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentExtensionService {
  InstallExtension(...InstallExtensionRequest): InstallExtensionResponse;
  UninstallExtension(...UninstallExtensionRequest): UninstallExtensionResponse;
  GetInstallation(...GetInstallationRequest): GetInstallationResponse;
  ListInstallations(...ListInstallationsRequest): ListInstallationsResponse;
  CreateAdapterConnection(...CreateAdapterConnectionRequest): CreateAdapterConnectionResponse;
  DeleteAdapterConnection(...DeleteAdapterConnectionRequest): DeleteAdapterConnectionResponse;
  ListAdapterConnections(...ListAdapterConnectionsRequest): ListAdapterConnectionsResponse;
}

@message
model InstallExtensionRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) extension_id: string;
  @field(4) manifest_ref: string;
}

@message
model InstallExtensionResponse {
  @field(1) installation: ExtensionInstallation;
}

@message
model UninstallExtensionRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
}

@message
model UninstallExtensionResponse {
  @field(1) installation: ExtensionInstallation;
}

@message
model GetInstallationRequest {
  @field(1) agent_id: string;
  @field(2) installation_id: string;
}

@message
model GetInstallationResponse {
  @field(1) installation: ExtensionInstallation;
}

@message
model ListInstallationsRequest {
  @field(1) agent_id: string;
  @field(2) page?: PageRequest;
}

@message
model ListInstallationsResponse {
  @field(1) installations: ExtensionInstallation[];
  @field(2) page: PageResponse;
}

@message
model CreateAdapterConnectionRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) adapter_id: string;
}

@message
model CreateAdapterConnectionResponse {
  @field(1) connection: AdapterConnection;
}

@message
model DeleteAdapterConnectionRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) connection_id: string;
}

@message
model DeleteAdapterConnectionResponse {
  @field(1) connection: AdapterConnection;
}

@message
model ListAdapterConnectionsRequest {
  @field(1) agent_id: string;
  @field(2) installation_id?: string;
  @field(3) page?: PageRequest;
}

@message
model ListAdapterConnectionsResponse {
  @field(1) connections: AdapterConnection[];
  @field(2) page: PageResponse;
}
