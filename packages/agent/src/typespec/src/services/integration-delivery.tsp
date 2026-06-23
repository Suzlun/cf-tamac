using Protobuf;

namespace CfTamac.Agent.V1;

@Protobuf.service
interface IntegrationDeliveryService {
  Deliver(...DeliverRequest): DeliverResponse;
}

@message
model DeliverRequest {
  @field(1) agent_id: string;
  @field(2) idempotency_key: string;
  @field(3) installation_id: string;
  @field(4) connection_id: string;
  @field(5) delivery_context_id: string;
  @field(6) delivery_id: string;
  @field(7) thread_id: string;
  @field(8) run_id: string;
  @field(9) payload: BytePayloadReference;
  @field(10) timestamp: RequestTimestamp;
  @field(11) nonce: NonceMetadata;
  @field(12) raw_body_digest: RawBodyDigest;
  @field(13) signature: SignatureMetadata;
}

@message
model DeliverResponse {
  @field(1) delivery: AdapterDelivery;
  @field(2) operation?: ProviderOperation;
  @field(3) status: string;
}
