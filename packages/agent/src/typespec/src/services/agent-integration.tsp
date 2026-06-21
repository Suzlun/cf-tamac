using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface AgentIntegrationService {
  InstallIntegration(...InstallIntegrationRequest): InstallIntegrationResponse;
  UninstallIntegration(...UninstallIntegrationRequest): UninstallIntegrationResponse;
  GetInstallation(...GetInstallationRequest): GetInstallationResponse;
  ListInstallations(...ListInstallationsRequest): ListInstallationsResponse;
  CreateAdapterConnection(...CreateAdapterConnectionRequest): CreateAdapterConnectionResponse;
  DeleteAdapterConnection(...DeleteAdapterConnectionRequest): DeleteAdapterConnectionResponse;
  ListAdapterConnections(...ListAdapterConnectionsRequest): ListAdapterConnectionsResponse;
}

@message
model InstallIntegrationRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) integration_id: string;
  @field(4) manifest_ref: string;
}

@message
model InstallIntegrationResponse {
  @field(1) installation: IntegrationInstallation;
}

@message
model UninstallIntegrationRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
}

@message
model UninstallIntegrationResponse {
  @field(1) installation: IntegrationInstallation;
}

@message
model GetInstallationRequest {
  @field(1) agent_id: string;
  @field(2) installation_id: string;
}

@message
model GetInstallationResponse {
  @field(1) installation: IntegrationInstallation;
}

@message
model ListInstallationsRequest {
  @field(1) agent_id: string;
  @field(2) page?: PageRequest;
}

@message
model ListInstallationsResponse {
  @field(1) installations: IntegrationInstallation[];
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
