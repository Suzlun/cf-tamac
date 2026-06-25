## 1. Contract and Codegen

- [x] 1.1 Update `packages/agent/src/typespec/src/models/model-policy.tsp` and related model files for model policy, Event override, Run snapshot, health, lifecycle, state, and run response fields.
- [x] 1.2 Add `packages/agent/src/typespec/src/services/agent-model-policy.tsp` and import it from `packages/agent/src/typespec/main.tsp`.
- [x] 1.3 Update `packages/agent/src/typespec/src/services/agent-event.tsp`, `agent-adapter.tsp`, `agent-health.tsp`, `agent-lifecycle.tsp`, `agent-state.tsp`, and `agent-run.tsp` for the new fields.
- [x] 1.4 Run `pnpm gen:agent:proto && pnpm gen:agent:rpc` and keep `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, and `packages/client/src/generated/agent-rpc/**` generated only.
- [x] 1.5 Update `scripts/codegen/check-agent-codegen-drift.mjs` for `AgentModelPolicyService`, request invariants, and model policy field stability.
- [x] 1.6 Add/update contract tests named with `[AGENT-MODEL-POLICY-S004]` for generated `AgentModelPolicyService` inventory and request fields.
- [x] 1.7 Add/update platform tests named with `[AGENT-PLATFORM-S016]` for Protobuf RPC-only policy service registration and forbidden REST/OpenAPI/Orval output.
- [x] 1.8 Add/update platform binding tests named with `[AGENT-PLATFORM-S015]` for Workers AI `AI` binding presence and Client storage/Queues absence.

## 2. Agent Model Policy Storage and Config

- [x] 2.1 Add `packages/agent/src/storage/model-policy-schema.ts` and connect it through `storage/schema.ts`, `table-initializer.ts`, and `repositories.ts`.
- [x] 2.2 Add `packages/agent/src/storage/model-policy-repository.ts` with upsert, get, list, archive, validate, deterministic digest, and secret-free persistence.
- [x] 2.3 Update `packages/agent/src/domain/lifecycle-operations.ts` and `state-operations.ts` for initial policy seed, active ref validation, config version updates, and safe config views.
- [x] 2.4 Update `packages/agent/src/AIAgent.ts`, `AIAgent.types.ts`, `rpc/model-policy-do-router.ts`, `rpc/model-policy-message-mappers.ts`, and `rpc/services/model-policies.ts` for policy RPC command/query handling.
- [x] 2.5 Add/update repository tests named with `[AGENT-MODEL-POLICY-S001]` for safe metadata and digest persistence.
- [x] 2.6 Add/update validation tests named with `[AGENT-MODEL-POLICY-S002]` for unsupported provider/model rejection without state changes.
- [x] 2.7 Add/update policy resolution tests named with `[AGENT-MODEL-POLICY-S003]` for disabled/archived policy rejection during Run selection.
- [x] 2.8 Add/update lifecycle tests named with `[AGENT-MODEL-POLICY-S005]` for default policy seed and config ref capture.
- [x] 2.9 Add/update policy selection tests named with `[AGENT-MODEL-POLICY-S006]` for authorized Event override acceptance and unauthorized override rejection.
- [x] 2.10 Add/update lifecycle tests named with `[AGENT-LIFECYCLE-S008]` for InitializeAgent storing default policy ref and digest.
- [x] 2.11 Add/update config tests named with `[AGENT-LIFECYCLE-S009]` for UpdateConfig accepting only active model policy refs.

## 3. Event Override, Integration Grants, and Authorization

- [x] 3.1 Update `packages/agent/src/events/operations.ts` to validate requested model policy refs, store requested ref/safe metadata, and reject invalid override before Event persistence.
- [x] 3.2 Update `packages/agent/src/domain/final-authorization.ts` for model policy scopes, Client override grants, and Integration allowlist checks.
- [x] 3.3 Update `packages/agent/src/integrations/operations.ts` and `operations-ingress-delivery.ts` for Installation/Connection policy allowlists and ingress override validation.
- [x] 3.4 Add/update Event tests named with `[AGENT-EVENTING-S010]` for Client Event override acceptance and pending Run coalescing.
- [x] 3.5 Add/update Event tests named with `[AGENT-EVENTING-S011]` for Integration grant外 override rejection without Event/Run/wake writes.
- [x] 3.6 Add/update security tests named with `[AGENT-SECURITY-S016]` for principal without override scope being rejected before state changes.
- [x] 3.7 Add/update integration tests named with `[AGENT-INTEGRATION-S009]` for Connection allowlist acceptance/rejection of policy overrides.

## 4. Model Provider, Invocation Ledger, Health, and Observability

- [x] 4.1 Update `packages/agent/wrangler.toml` and `packages/agent/src/env.ts` for Workers AI `AI` binding typing and readiness checks.
- [x] 4.2 Add `packages/agent/src/harness/model-io.ts` for model request metadata, provider result types, decision schema parsing, digest helpers, and safe summaries.
- [x] 4.3 Add `packages/agent/src/model-provider-workers-ai.ts` to adapt Workers AI binding to the pure model provider interface without importing platform runtime into lower layers.
- [x] 4.4 Add `packages/agent/src/storage/model-invocation-schema.ts` and `model-invocation-repository.ts` for invocation attempt, heartbeat, usage, latency, digest, and recovery state.
- [x] 4.5 Update `packages/agent/src/harness/context-builder.ts`, `observability/records.ts`, and `observability/redaction.ts` for safe context ordering, prompt/response digest, and raw prompt/completion/reasoning redaction.
- [x] 4.6 Update `packages/agent/src/rpc/services/health.ts` for model execution capability readiness and safe health response metadata.
- [x] 4.7 Add/update provider tests named with `[AGENT-MODEL-INVOCATION-S001]` for missing Workers AI binding fail-closed behavior.
- [x] 4.8 Add/update provider tests named with `[AGENT-MODEL-INVOCATION-S002]` for provider failure normalization and secret-free errors.
- [x] 4.9 Add/update context tests named with `[AGENT-MODEL-INVOCATION-S003]` for stable Context Builder to model input ordering.
- [x] 4.10 Add/update parser tests named with `[AGENT-MODEL-INVOCATION-S004]` for valid model output to typed `HarnessDecision[]` conversion.
- [x] 4.11 Add/update parser tests named with `[AGENT-MODEL-INVOCATION-S005]` for malformed output rejection without side effects.
- [x] 4.12 Add/update ledger tests named with `[AGENT-MODEL-INVOCATION-S006]` for safe invocation metadata and digest-only persistence.
- [x] 4.13 Add/update recovery tests named with `[AGENT-MODEL-INVOCATION-S007]` for lease recovery preserving one active Run slot.
- [x] 4.14 Add/update health tests named with `[AGENT-HEALTH-S004]` for model execution capability status and secret-free response.
- [x] 4.15 Add/update security tests named with `[AGENT-SECURITY-S017]` for observability excluding raw prompt, completion, reasoning, and credentials.
- [x] 4.16 Add/update error mapping tests named with `[AGENT-SECURITY-S018]` for model failure categories and Connect codes.

## 5. Run Execution and Decision Commit

- [x] 5.1 Update `packages/agent/src/runs/scheduler.ts` and `runs/operations.ts` to connect pending Run selection to snapshot creation, model policy resolution, model invocation, decision parsing, commit, and status transition.
- [x] 5.2 Update `packages/agent/src/runs/views.ts` for safe model policy snapshot, invocation summary, and failure category views.
- [x] 5.3 Update `packages/agent/src/harness/commit-guard.ts`, `harness/budget.ts`, and `harness/decisions.ts` for policy/config/capability stale checks, model usage accounting, and typed commit results.
- [x] 5.4 Update `packages/agent/src/tools/operations.ts` for `invoke_tool` decision, waiting Run transition, result resume, duplicate result handling, and stale result rejection.
- [x] 5.5 Update `packages/agent/src/schedules/operations.ts` for `create_schedule` decision commit and causation metadata.
- [x] 5.6 Update memory repository/commit paths for `write_memory` decision provenance and safe summary persistence.
- [x] 5.7 Update delivery/integration paths for `respond` decision, Delivery result classification, waiting resume, and follow-up Event creation.
- [x] 5.8 Add/update Run tests named with `[AGENT-RUNTIME-S011]` for Event-to-model-to-decision terminal flow using deterministic provider.
- [x] 5.9 Add/update Run snapshot tests named with `[AGENT-RUNTIME-S012]` for `event_override` versus `agent_default` policy source capture.
- [x] 5.10 Add/update stale guard tests named with `[AGENT-RUNTIME-S013]` for policy digest mismatch blocking model call or commit.
- [x] 5.11 Add/update decision commit tests named with `[AGENT-RUNTIME-S014]` for Memory, Schedule, Event, and stop side effects with causal links.
- [x] 5.12 Add/update waiting tests named with `[AGENT-RUNTIME-S015]` for Tool waiting active slot release and resume.
- [x] 5.13 Add/update budget tests named with `[AGENT-RUNTIME-S016]` for model/token/provider budget stopping before side effects.
- [x] 5.14 Add/update memory tests named with `[AGENT-MEMORY-S009]` for model input metadata and raw body exclusion.
- [x] 5.15 Add/update memory tests named with `[AGENT-MEMORY-S010]` for `write_memory` provenance and raw reasoning exclusion.
- [x] 5.16 Add/update Tool tests named with `[AGENT-TOOL-S009]` for ToolInvocation creation and waiting Run transition.
- [x] 5.17 Add/update Tool tests named with `[AGENT-TOOL-S010]` for Tool result resume and stale result rejection.
- [x] 5.18 Add/update Schedule tests named with `[AGENT-SCHEDULE-S006]` for `create_schedule` decision causation and fire behavior.
- [x] 5.19 Add/update Integration tests named with `[AGENT-INTEGRATION-S010]` for Delivery result resume, terminal failure, follow-up Event, and stale callback handling.

## 6. Management Client UI and Server Actions

- [x] 6.1 Add `packages/client/src/server/actions/model-policies.ts` for server-only validate/upsert/archive/get flows using generated Agent RPC clients.
- [x] 6.2 Update `packages/client/src/server/actions/agent-lifecycle.ts` to send initial model policy and `initialConfig.modelPolicyRef` during Agent creation.
- [x] 6.3 Update `packages/client/src/server/actions/agent-operations.ts` to upsert policy before `UpdateConfig` and return safe metadata/errors.
- [x] 6.4 Add `packages/client/src/components/model-policy-fields.tsx` and `model-policy-summary.tsx` with browser-safe props and accessible validation states.
- [x] 6.5 Update `agent-registration-form.tsx`, `agent-settings-form.tsx`, `schemas/agent-registration.ts`, `schemas/agent-settings.ts`, `/agents/new/page.tsx`, and `/agents/[agentId]/settings/page.tsx` for policy input and safe metadata display.
- [x] 6.6 Add/update UI and server action tests named with `[CLIENT-MANAGEMENT-S017]` for Agent creation sending initial model policy through server-side RPC.
- [x] 6.7 Add/update UI and server action tests named with `[CLIENT-MANAGEMENT-S018]` for Settings policy update, safe error display, and browser secrecy.
- [x] 6.8 Add/update Client boundary tests named with `[CLIENT-REGISTRY-S009]` for Client D1 not storing authoritative model policy body or secrets.
- [x] 6.9 Add/update Client RPC tests named with `[CLIENT-REGISTRY-S010]` for Client server reading policy truth from Agent RPC and returning safe Browser data.
- [x] 6.10 Add `tests/e2e/management-model-policy.spec.ts` with Playwright tests titled `[CLIENT-MANAGEMENT-S017]` and `[CLIENT-MANAGEMENT-S018]`.

## 7. Final Verification and Documentation Sync

- [x] 7.1 Re-run `pnpm gen:agent:proto && pnpm gen:agent:rpc` and inspect generated drift only under command-owned outputs.
- [x] 7.2 Run `pnpm check:codegen` and fix descriptor inventory, field stability, and generated drift issues.
- [x] 7.3 Run `pnpm check:agent && pnpm test:agent` and fix Agent contract/runtime/storage/security failures.
- [x] 7.4 Run `pnpm check:client && pnpm test:client` and fix Client UI/server-only/boundary failures.
- [x] 7.5 Run `pnpm test:e2e` for Management Client model policy flow and browser secrecy.
- [x] 7.6 Run `pnpm lint` and fix OpenSpec validation, Scenario ID coverage, governance, ESLint, and supply-chain failures.
- [x] 7.7 Update `openspec/changes/complete-autonomous-agent-runtime/design.md`, `tasks.md`, and delta specs if implementation changes any file scope, scenario mapping, or verification command.
- [x] 7.8 Capture staging smoke notes for Event publish with default policy and Event publish with override policy, using only safe metadata and digests.
