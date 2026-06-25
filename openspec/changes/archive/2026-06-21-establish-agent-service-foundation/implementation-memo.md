# Implementation Memo: establish-agent-service-foundation

## Sources Reviewed

- `docs/memo/仕様設計・アーキテクチャ設定.md`
- `openspec/changes/establish-agent-service-foundation/proposal.md`
- `openspec/changes/establish-agent-service-foundation/design.md`
- `openspec/changes/establish-agent-service-foundation/specs/agent-platform/spec.md`
- `openspec/changes/establish-agent-service-foundation/specs/client/spec.md`
- `openspec/changes/establish-agent-service-foundation/specs/workspace-governance/spec.md`
- `openspec/changes/establish-agent-service-foundation/tasks.md`

## Package Names And Deployment Units

- `packages/agent`: Agent Service Worker package. Use package name `@cf-tamac/agent` for filterable scripts and deploy commands.
- `packages/client`: management Client Worker package. Use package name `@cf-tamac/client` for filterable scripts and deploy commands.
- Old demo contract/server/UI packages stay in place only until replacement verification tasks 11.1 to 11.3 pass. They are deletion targets, not final architecture units.
- Agent Worker owns `AI_AGENT` Durable Object binding for `AIAgent` and Agent blob storage. It must not define D1, `CLIENT_DB`, Agent-cross D1, or Cloudflare Queues producer/consumer bindings.
- Client Worker owns `CLIENT_DB` and credential secret references. It must not define `AI_AGENT` or Agent-owned storage bindings.

## Generated Output Paths

- Agent TypeSpec source of truth: `packages/agent/src/typespec/main.tsp`.
- TypeSpec protobuf emitter config: `packages/agent/src/typespec/tspconfig.yaml`.
- Generated proto output: `packages/agent/proto/cftamac/agent/v1.proto`.
- Generated Agent RPC output: `packages/agent/src/generated/rpc/cftamac/agent/v1_pb.ts`.
- Generated Client RPC output: `packages/client/src/generated/agent-rpc/cftamac/agent/v1_pb.ts`.
- Agent OpenAPI output is forbidden. Orval-generated Agent clients are forbidden.
- Generated files under `proto/**` and `generated/**` are command-owned and must not be hand-edited.

## Root Commands To Add Or Preserve

- Add Agent generation commands: `pnpm gen:agent:proto`, `pnpm gen:agent:rpc`, `pnpm gen`.
- Update `pnpm check:codegen` to cover Agent proto/RPC drift, public Agent OpenAPI absence, RPC Service Inventory checks, descriptor invariants, and Protobuf field stability.
- Preserve supply-chain policy: `minimumReleaseAge: 4320`, package-by-package `allowBuilds`, no `dangerouslyAllowAllBuilds`, and no `minimumReleaseAgeExclude` bypass.
- Keep existing demo command graph only until replacement verification passes, then remove it from active workspace commands and documentation.

## RPC Service Inventory

| Service                     | Methods                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentLifecycleService`     | `InitializeAgent`, `GetAgent`, `DestroyAgent`, `RotateAgentCredential`                                                                                               |
| `AgentEventService`         | `PublishEvent`, `GetEvent`, `ListEvents`                                                                                                                             |
| `AgentThreadService`        | `ListThreads`, `GetThread`, `ListSections`, `GetLatestCompaction`, `GetThreadMemory`, `SearchThreadHistory`                                                          |
| `AgentRunService`           | `GetRun`, `ListRuns`, `CancelRun`                                                                                                                                    |
| `AgentStateService`         | `GetState`, `GetConfig`, `UpdateConfig`                                                                                                                              |
| `AgentScheduleService`      | `CreateSchedule`, `GetSchedule`, `ListSchedules`, `CancelSchedule`                                                                                                   |
| `AgentToolService`          | `ListTools`, `GetInvocation`, `ListInvocations`, `ApproveInvocation`, `RejectInvocation`                                                                             |
| `AgentIntegrationService`   | `InstallIntegration`, `UninstallIntegration`, `GetInstallation`, `ListInstallations`, `CreateAdapterConnection`, `DeleteAdapterConnection`, `ListAdapterConnections` |
| `IntegrationIngressService` | `PublishEvent`, `PublishToolResult`, `PublishDeliveryResult`                                                                                                         |
| `AgentHealthService`        | `Check`                                                                                                                                                              |

## Descriptor And Runtime Invariants

- Every public Agent RPC request body includes `agent_id`; metadata-only Agent scope is not allowed.
- Command requests include `idempotency_key`.
- `AgentEventService.PublishEvent` and `IntegrationIngressService.PublishEvent` include required `thread_key`.
- `thread_key` is Unicode NFC normalized, non-empty, maximum 512 UTF-8 bytes, case-sensitive, and scoped by `(agent_id, normalized_thread_key)` without implicit Integration/Adapter/Connection/principal prefixes.
- Agent-cross list/search methods such as `ListAllAgents`, `SearchAgents`, `ListAllToolInvocations`, and `ListAllIntegrationInstallations` are forbidden.
- All Protobuf fields have explicit `@field(n)` or generated equivalent. Deleted field numbers/names stay reserved. Field number reuse, service name duplicates, and duplicate method names inside a service fail governance checks.
- Production Agent RPC accepts unary Connect binary Protobuf only: `POST` with `Content-Type: application/proto`. JSON encodings and `GET` map to `unimplemented`; invalid/missing binary content and malformed Protobuf map to `invalid_argument`.
- All generated services register in the Connect router. `AgentHealthService.Check` reaches a foundation handler; unimplemented generated methods fail closed with Connect `unimplemented`.

## Client Route Shells

- `/`
- `/agents`
- `/agents/new`
- `/agents/[agentId]`
- `/agents/[agentId]/threads`
- `/agents/[agentId]/events`
- `/agents/[agentId]/schedules`
- `/agents/[agentId]/tools`
- `/agents/[agentId]/integrations`
- `/agents/[agentId]/settings`
- Do not add `/api/client/*`, `/api/agent*`, Agent REST proxy routes, arbitrary RPC forwarding handlers, `hello`, or `users` management routes.

## Scenario ID Readiness Plan

- `AGENT-PLATFORM-S001` to `S014`: covered by `packages/agent/src/tests/*.test.ts` tasks 7.1 to 7.14.
- `MANAGEMENT-CLIENT-S001` to `S008`: covered by `packages/client/src/tests/*.test.ts(x)` and `tests/e2e/management-*.spec.ts` tasks 8.1 to 8.8.
- `WORKSPACE-GOVERNANCE-S001`, `S002`, and `S009`: covered by `scripts/codegen/check-agent-codegen-drift.test.mjs` tasks 9.1 to 9.3.
- `WORKSPACE-GOVERNANCE-S003`, `S004`, `S006`, and `S008`: covered by `scripts/governance/*.test.mjs` tasks 1.4 and 9.4, 9.5, 9.7, 9.9.
- `WORKSPACE-GOVERNANCE-S005`: covered by `scripts/openspec/verify-scenario-coverage.test.mjs` task 9.6.
- `WORKSPACE-GOVERNANCE-S007`: covered by `scripts/security/verify-pnpm-supply-chain.test.mjs` task 9.8.
- Every automated test title must include the bracketed Scenario ID, for example `[AGENT-PLATFORM-S001] ...`.

## Deletion And Migration Order

1. Update `.opencode` coding-guardian, entrypoints, applier, engineer, reviewer, designer, build agent guidance before package/code implementation delegation.
2. Add OpenCode workflow alignment governance test for `WORKSPACE-GOVERNANCE-S008`.
3. Add replacement root command targets, `packages/agent`, `packages/client`, codegen, governance scripts, docs, and Scenario ID tests while keeping the existing demo graph active only as a rollback-safe deletion target.
4. Correct final scope before verification: suffix-less Scenario IDs, `.opencode/agents/unit/agent/**`, `.opencode/agents/unit/client/**`, Agent layer direction, and Next.js Client server/browser boundary.
5. Run replacement verification tasks 11.1 to 11.3: `pnpm gen`, `pnpm check:codegen`, package checks/tests, forbidden surface, Agent/Client layer boundaries, supply-chain, no-proxy, queue wake, and `.opencode` workflow checks.
6. Only after replacement verification passes, remove `hello` / `users` TypeSpec files, server routes/domain/usecase/persistence files, Drizzle demo tables, UI pages/hooks/mocks, Orval config, generated OpenAPI contract tests, demo E2E flows, and the old demo package graph from the active workspace.
7. Remove root `wrangler.toml` from active commands after `packages/agent/wrangler.toml` and `packages/client/wrangler.toml` own dev/deploy scripts.
8. Run final validation and OpenSpec sync/archive readiness checks.
