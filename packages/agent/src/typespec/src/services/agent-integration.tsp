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
  @field(5) manifest_payload?: BytePayloadReference;
  @field(6) requested_grants: string[];
  @field(7) setup_metadata_ref?: BytePayloadReference;
  @field(8) security?: SecurityMetadata;
}

@message
model InstallIntegrationResponse {
  @field(1) installation: IntegrationInstallation;
  @field(2) definition?: IntegrationDefinition;
  @field(3) grants: IntegrationGrant[];
  @field(4) trust_key?: InstallationTrustKey;
  @field(5) audit?: AgentAuditRecord;
}

@message
model UninstallIntegrationRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) reason?: string;
  @field(5) security?: SecurityMetadata;
}

@message
model UninstallIntegrationResponse {
  @field(1) installation: IntegrationInstallation;
  @field(2) disabled_connections: AdapterConnection[];
  @field(3) audit?: AgentAuditRecord;
}

@message
model GetInstallationRequest {
  @field(1) agent_id: string;
  @field(2) installation_id: string;
}

@message
model GetInstallationResponse {
  @field(1) installation: IntegrationInstallation;
  @field(2) definition?: IntegrationDefinition;
  @field(3) grants: IntegrationGrant[];
}

@message
model ListInstallationsRequest {
  @field(1) agent_id: string;
  @field(2) page?: PageRequest;
  @field(3) status?: string;
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
  @field(5) connection_key?: string;
  @field(6) external_subject?: string;
  @field(7) metadata_ref?: BytePayloadReference;
  @field(8) security?: SecurityMetadata;
}

@message
model CreateAdapterConnectionResponse {
  @field(1) connection: AdapterConnection;
  @field(2) audit?: AgentAuditRecord;
}

@message
model DeleteAdapterConnectionRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) connection_id: string;
  @field(4) reason?: string;
  @field(5) security?: SecurityMetadata;
}

@message
model DeleteAdapterConnectionResponse {
  @field(1) connection: AdapterConnection;
  @field(2) audit?: AgentAuditRecord;
}

@message
model ListAdapterConnectionsRequest {
  @field(1) agent_id: string;
  @field(2) installation_id?: string;
  @field(3) page?: PageRequest;
  @field(4) status?: string;
  @field(5) adapter_id?: string;
}

@message
model ListAdapterConnectionsResponse {
  @field(1) connections: AdapterConnection[];
  @field(2) page: PageResponse;
}
