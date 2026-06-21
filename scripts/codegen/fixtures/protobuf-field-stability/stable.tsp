using Protobuf;

namespace Fixture.Stable;

@message
model StableMessage {
  @field(1) field_one: string;
  @field(2) field_two: string;
}
