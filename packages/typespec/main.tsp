import "@typespec/http";
import "@typespec/openapi";
import "@typespec/openapi3";

// Shared models
import "./src/common/errors.tsp";
import "./src/models/hello.tsp";
import "./src/models/user.tsp";

// Versioned API routes
import "./src/routes/v1/_namespace.tsp";
import "./src/routes/v1/hello.tsp";
import "./src/routes/v1/users.tsp";

using Http;
using TypeSpec.OpenAPI;

@service(#{ title: "cfreact-template API" })
@info(#{ version: "1.0.0" })
@server("/", "Default server")
namespace CfreactTemplate;
