using Protobuf;

namespace CfTamac.Agent.V1;

@message
model RpcErrorDetail {
  @field(1) code: string;
  @field(2) message: string;
  @field(3) target?: string;
  @field(4) retryable: boolean;
  @field(5) domain_reason?: string;
  @field(6) correlation_id?: string;
}

@message
model OperationStatus {
  @field(1) ok: boolean;
  @field(2) error?: RpcErrorDetail;
  @field(3) outcome: string;
  @field(4) audit_event_id?: string;
}

@message
model ErrorMetadata {
  @field(1) error_id: string;
  @field(2) connect_code: string;
  @field(3) retryable: boolean;
  @field(4) safe_message: string;
  @field(5) details_ref?: string;
}
