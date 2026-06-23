using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface IntegrationToolService {
  InvokeTool(...InvokeToolRequest): InvokeToolResponse;
  GetOperation(...GetOperationRequest): GetOperationResponse;
  CancelOperation(...CancelOperationRequest): CancelOperationResponse;
}

@message
model InvokeToolRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) tool_id: string;
  @field(5) invocation_id: string;
  @field(6) thread_id: string;
  @field(7) run_id: string;
  @field(8) input: BytePayloadReference;
  @field(9) timestamp: RequestTimestamp;
  @field(10) nonce: NonceMetadata;
  @field(11) raw_body_digest: RawBodyDigest;
  @field(12) signature: SignatureMetadata;
}

@message
model InvokeToolResponse {
  @field(1) operation: ProviderOperation;
  @field(2) invocation_status: string;
  @field(3) output?: BytePayloadReference;
}

@message
model GetOperationRequest {
  @field(1) agent_id: string;
  @field(2) installation_id: string;
  @field(3) operation_id: string;
  @field(4) invocation_id?: string;
  @field(5) timestamp?: RequestTimestamp;
  @field(6) nonce?: NonceMetadata;
  @field(7) raw_body_digest?: RawBodyDigest;
  @field(8) signature?: SignatureMetadata;
}

@message
model GetOperationResponse {
  @field(1) operation: ProviderOperation;
  @field(2) output?: BytePayloadReference;
}

@message
model CancelOperationRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) operation_id: string;
  @field(5) invocation_id?: string;
  @field(6) reason?: string;
  @field(7) timestamp: RequestTimestamp;
  @field(8) nonce: NonceMetadata;
  @field(9) raw_body_digest: RawBodyDigest;
  @field(10) signature: SignatureMetadata;
}

@message
model CancelOperationResponse {
  @field(1) operation: ProviderOperation;
  @field(2) cancellation_status: string;
}
