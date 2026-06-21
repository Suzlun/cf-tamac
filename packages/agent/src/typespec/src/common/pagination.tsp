using Protobuf;

namespace CfTamac.Agent.V1;

@message
model PageRequest {
  @field(1) page_size?: int32;
  @field(2) page_token?: string;
}

@message
model PageResponse {
  @field(1) next_page_token?: string;
}
