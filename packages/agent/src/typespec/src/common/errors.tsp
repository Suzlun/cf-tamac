using Protobuf;

namespace CfTamac.Agent.V1;

@message
model RpcErrorDetail {
  @field(1) code: string;
  @field(2) message: string;
  @field(3) target?: string;
}

@message
model OperationStatus {
  @field(1) ok: boolean;
  @field(2) error?: RpcErrorDetail;
}
