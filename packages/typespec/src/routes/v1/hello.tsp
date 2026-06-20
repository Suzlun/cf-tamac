import "@typespec/http";
import "@typespec/openapi";

using Http;
using TypeSpec.OpenAPI;

namespace CfTamac.ApiV1;

@tag("hello")
@summary("Returns greeting")
@operationId("getHello")
@get
@route("/hello")
op getHello(): {
  @statusCode statusCode: 200;
  @body body: CfTamac.HelloResponse;
};
