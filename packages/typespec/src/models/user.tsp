import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace CfreactTemplate;

model User {
  id: int64;
  name: string;
  @format("email") email: string;
  createdAt: utcDateTime;
}

model CreateUserInput {
  name: string;
  @format("email") email: string;
}
