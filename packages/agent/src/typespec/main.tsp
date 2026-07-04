import "@typespec/protobuf";

import "./src/common/errors.tsp";
import "./src/common/pagination.tsp";
import "./src/common/security.tsp";
import "./src/models/access-credential.tsp";
import "./src/models/adapter.tsp";
import "./src/models/agent.tsp";
import "./src/models/compaction.tsp";
import "./src/models/event.tsp";
import "./src/models/integration.tsp";
import "./src/models/history.tsp";
import "./src/models/memory.tsp";
import "./src/models/model-policy.tsp";
import "./src/models/run.tsp";
import "./src/models/schedule.tsp";
import "./src/models/section.tsp";
import "./src/models/state.tsp";
import "./src/models/thread.tsp";
import "./src/models/tool.tsp";
import "./src/services/agent-adapter.tsp";
import "./src/services/agent-event.tsp";
import "./src/services/agent-integration.tsp";
import "./src/services/agent-health.tsp";
import "./src/services/agent-lifecycle.tsp";
import "./src/services/agent-model-policy.tsp";
import "./src/services/agent-run.tsp";
import "./src/services/agent-schedule.tsp";
import "./src/services/agent-state.tsp";
import "./src/services/agent-thread.tsp";
import "./src/services/agent-tool.tsp";
import "./src/services/integration-delivery.tsp";
import "./src/services/integration-tool.tsp";

using Protobuf;

// Agent public API source of truth is this TypeSpec tree.
// Emit Protobuf only; do not configure alternate Agent HTTP schema emitters here.
// Production transport profile is unary Connect with binary Protobuf.
// Field-number policy: every message field MUST keep an explicit @field(n).
// If a field is removed, reserve the old number/name before reusing nothing.
@package({
  name: "cftamac.agent.v1",
})
namespace CfTamac.Agent.V1;
