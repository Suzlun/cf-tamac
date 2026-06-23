using Protobuf;

namespace CfTamac.Agent.V1;

@message
model PageRequest {
  @field(1) page_size?: int32;
  @field(2) page_token?: string;
  @field(3) order_by?: string;
  @field(4) filter?: string;
  @field(5) cursor_scope?: string;
}

@message
model PageResponse {
  @field(1) next_page_token?: string;
  @field(2) result_count: int32;
  @field(3) cursor_scope?: string;
}

@message
model TimeRange {
  @field(1) start_unix_ms?: int64;
  @field(2) end_unix_ms?: int64;
}
