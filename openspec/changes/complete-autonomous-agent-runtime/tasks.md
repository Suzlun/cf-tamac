## 1. Contract and Codegen

- [ ] 1.1 Update `packages/agent/src/typespec/src/models/model-policy.tsp` and related model files for model policy, Event override, Run snapshot, health, lifecycle, state, and run response fields.
- [ ] 1.2 Add `packages/agent/src/typespec/src/services/agent-model-policy.tsp` and import it from `packages/agent/src/typespec/main.tsp`.
- [ ] 1.3 Update `packages/agent/src/typespec/src/services/agent-event.tsp`, `agent-adapter.tsp`, `agent-health.tsp`, `agent-lifecycle.tsp`, `agent-state.tsp`, and `agent-run.tsp` for the new fields.
- [ ] 1.4 Run `pnpm gen:agent:proto && pnpm gen:agent:rpc` and keep `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, and `packages/client/src/generated/agent-rpc/**` generated only.
- [ ] 1.5 Update `scripts/codegen/check-agent-codegen-drift.mjs` for `AgentModelPolicyService`, request invariants, and model policy field stability.
- [ ] 1.6 Add/update contract tests named with `[AGENT-MODEL-POLICY-S004]` for generated `AgentModelPolicyService` inventory and request fields.
- [ ] 1.7 Add/update platform tests named with `[AGENT-PLATFORM-S016]` for Protobuf RPC-only policy service registration and forbidden REST/OpenAPI/Orval output.
- [ ] 1.8 Add/update platform binding tests named with `[AGENT-PLATFORM-S015]` for Workers AI `AI` binding presence and Client storage/Queues absence.

## 2. Agent Model Policy Storage and Config

- [ ] 2.1 Add `packages/agent/src/storage/model-policy-schema.ts` and connect it through `storage/schema.ts`, `table-initializer.ts`, and `repositories.ts`.
- [ ] 2.2 Add `packages/agent/src/storage/model-policy-repository.ts` with upsert, get, list, archive, validate, deterministic digest, and secret-free persistence.
- [ ] 2.3 Update `packages/agent/src/domain/lifecycle-operations.ts` and `state-operations.ts` for initial policy seed, active ref validation, config version updates, and safe config views.
- [ ] 2.4 Update `packages/agent/src/AIAgent.ts`, `AIAgent.types.ts`, `rpc/model-policy-do-router.ts`, `rpc/model-policy-message-mappers.ts`, and `rpc/services/model-policies.ts` for policy RPC command/query handling.
- [ ] 2.5 Add/update repository tests named with `[AGENT-MODEL-POLICY-S001]` for safe metadata and digest persistence.
- [ ] 2.6 Add/update validation tests named with `[AGENT-MODEL-POLICY-S002]` for unsupported provider/model rejection without state changes.
- [ ] 2.7 Add/update policy resolution tests named with `[AGENT-MODEL-POLICY-S003]` for disabled/archived policy rejection during Run selection.
- [ ] 2.8 Add/update lifecycle tests named with `[AGENT-MODEL-POLICY-S005]` for default policy seed and config ref capture.
- [ ] 2.9 Add/update policy selection tests named with `[AGENT-MODEL-POLICY-S006]` for authorized Event override acceptance and unauthorized override rejection.
- [ ] 2.10 Add/update lifecycle tests named with `[AGENT-LIFECYCLE-S008]` for InitializeAgent storing default policy ref and digest.
- [ ] 2.11 Add/update config tests named with `[AGENT-LIFECYCLE-S009]` for UpdateConfig accepting only active model policy refs.

## 3. Event Override, Integration Grants, and Authorization

- [ ] 3.1 Update `packages/agent/src/events/operations.ts` to validate requested model policy refs, store requested ref/safe metadata, and reject invalid override before Event persistence.
- [ ] 3.2 Update `packages/agent/src/domain/final-authorization.ts` for model policy scopes, Client override grants, and Integration allowlist checks.
- [ ] 3.3 Update `packages/agent/src/integrations/operations.ts` and `operations-ingress-delivery.ts` for Installation/Connection policy allowlists and ingress override validation.
- [ ] 3.4 Add/update Event tests named with `[AGENT-EVENTING-S010]` for Client Event override acceptance and pending Run coalescing.
- [ ] 3.5 Add/update Event tests named with `[AGENT-EVENTING-S011]` for Integration grant外 override rejection without Event/Run/wake writes.
- [ ] 3.6 Add/update security tests named with `[AGENT-SECURITY-S016]` for principal without override scope being rejected before state changes.
- [ ] 3.7 Add/update integration tests named with `[AGENT-INTEGRATION-S009]` for Connection allowlist acceptance/rejection of policy overrides.

## 4. Model Provider, Invocation Ledger, Health, and Observability

- [ ] 4.1 Update `packages/agent/wrangler.toml` and `packages/agent/src/env.ts` for Workers AI `AI` binding typing and readiness checks.
- [ ] 4.2 Add `packages/agent/src/harness/model-io.ts` for model request metadata, provider result types, decision schema parsing, digest helpers, and safe summaries.
- [ ] 4.3 Add `packages/agent/src/model-provider-workers-ai.ts` to adapt Workers AI binding to the pure model provider interface without importing platform runtime into lower layers.
- [ ] 4.4 Add `packages/agent/src/storage/model-invocation-schema.ts` and `model-invocation-repository.ts` for invocation attempt, heartbeat, usage, latency, digest, and recovery state.
- [ ] 4.5 Update `packages/agent/src/harness/context-builder.ts`, `observability/records.ts`, and `observability/redaction.ts` for safe context ordering, prompt/response digest, and raw prompt/completion/reasoning redaction.
- [ ] 4.6 Update `packages/agent/src/rpc/services/health.ts` for model execution capability readiness and safe health response metadata.
- [ ] 4.7 Add/update provider tests named with `[AGENT-MODEL-INVOCATION-S001]` for missing Workers AI binding fail-closed behavior.
- [ ] 4.8 Add/update provider tests named with `[AGENT-MODEL-INVOCATION-S002]` for provider failure normalization and secret-free errors.
- [ ] 4.9 Add/update context tests named with `[AGENT-MODEL-INVOCATION-S003]` for stable Context Builder to model input ordering.
- [ ] 4.10 Add/update parser tests named with `[AGENT-MODEL-INVOCATION-S004]` for valid model output to typed `HarnessDecision[]` conversion.
- [ ] 4.11 Add/update parser tests named with `[AGENT-MODEL-INVOCATION-S005]` for malformed output rejection without side effects.
- [ ] 4.12 Add/update ledger tests named with `[AGENT-MODEL-INVOCATION-S006]` for safe invocation metadata and digest-only persistence.
- [ ] 4.13 Add/update recovery tests named with `[AGENT-MODEL-INVOCATION-S007]` for lease recovery preserving one active Run slot.
- [ ] 4.14 Add/update health tests named with `[AGENT-HEALTH-S004]` for model execution capability status and secret-free response.
- [ ] 4.15 Add/update security tests named with `[AGENT-SECURITY-S017]` for observability excluding raw prompt, completion, reasoning, and credentials.
- [ ] 4.16 Add/update error mapping tests named with `[AGENT-SECURITY-S018]` for model failure categories and Connect codes.

## 5. Run Execution and Decision Commit

- [ ] 5.1 Update `packages/agent/src/runs/scheduler.ts` and `runs/operations.ts` to connect pending Run selection to snapshot creation, model policy resolution, model invocation, decision parsing, commit, and status transition.
- [ ] 5.2 Update `packages/agent/src/runs/views.ts` for safe model policy snapshot, invocation summary, and failure category views.
- [ ] 5.3 Update `packages/agent/src/harness/commit-guard.ts`, `harness/budget.ts`, and `harness/decisions.ts` for policy/config/capability stale checks, model usage accounting, and typed commit results.
- [ ] 5.4 Update `packages/agent/src/tools/operations.ts` for `invoke_tool` decision, waiting Run transition, result resume, duplicate result handling, and stale result rejection.
- [ ] 5.5 Update `packages/agent/src/schedules/operations.ts` for `create_schedule` decision commit and causation metadata.
- [ ] 5.6 Update memory repository/commit paths for `write_memory` decision provenance and safe summary persistence.
- [ ] 5.7 Update delivery/integration paths for `respond` decision, Delivery result classification, waiting resume, and follow-up Event creation.
- [ ] 5.8 Add/update Run tests named with `[AGENT-RUNTIME-S011]` for Event-to-model-to-decision terminal flow using deterministic provider.
- [ ] 5.9 Add/update Run snapshot tests named with `[AGENT-RUNTIME-S012]` for `event_override` versus `agent_default` policy source capture.
- [ ] 5.10 Add/update stale guard tests named with `[AGENT-RUNTIME-S013]` for policy digest mismatch blocking model call or commit.
- [ ] 5.11 Add/update decision commit tests named with `[AGENT-RUNTIME-S014]` for Memory, Schedule, Event, and stop side effects with causal links.
- [ ] 5.12 Add/update waiting tests named with `[AGENT-RUNTIME-S015]` for Tool waiting active slot release and resume.
- [ ] 5.13 Add/update budget tests named with `[AGENT-RUNTIME-S016]` for model/token/provider budget stopping before side effects.
- [ ] 5.14 Add/update memory tests named with `[AGENT-MEMORY-S009]` for model input metadata and raw body exclusion.
- [ ] 5.15 Add/update memory tests named with `[AGENT-MEMORY-S010]` for `write_memory` provenance and raw reasoning exclusion.
- [ ] 5.16 Add/update Tool tests named with `[AGENT-TOOL-S009]` for ToolInvocation creation and waiting Run transition.
- [ ] 5.17 Add/update Tool tests named with `[AGENT-TOOL-S010]` for Tool result resume and stale result rejection.
- [ ] 5.18 Add/update Schedule tests named with `[AGENT-SCHEDULE-S006]` for `create_schedule` decision causation and fire behavior.
- [ ] 5.19 Add/update Integration tests named with `[AGENT-INTEGRATION-S010]` for Delivery result resume, terminal failure, follow-up Event, and stale callback handling.

## 6. Management Client UI and Server Actions

- [ ] 6.1 Add `packages/client/src/server/actions/model-policies.ts` for server-only validate/upsert/archive/get flows using generated Agent RPC clients.
- [ ] 6.2 Update `packages/client/src/server/actions/agent-lifecycle.ts` to send initial model policy and `initialConfig.modelPolicyRef` during Agent creation.
- [ ] 6.3 Update `packages/client/src/server/actions/agent-operations.ts` to upsert policy before `UpdateConfig` and return safe metadata/errors.
- [ ] 6.4 Add `packages/client/src/components/model-policy-fields.tsx` and `model-policy-summary.tsx` with browser-safe props and accessible validation states.
- [ ] 6.5 Update `agent-registration-form.tsx`, `agent-settings-form.tsx`, `schemas/agent-registration.ts`, `schemas/agent-settings.ts`, `/agents/new/page.tsx`, and `/agents/[agentId]/settings/page.tsx` for policy input and safe metadata display.
- [ ] 6.6 Add/update UI and server action tests named with `[CLIENT-MANAGEMENT-S017]` for Agent creation sending initial model policy through server-side RPC.
- [ ] 6.7 Add/update UI and server action tests named with `[CLIENT-MANAGEMENT-S018]` for Settings policy update, safe error display, and browser secrecy.
- [ ] 6.8 Add/update Client boundary tests named with `[CLIENT-REGISTRY-S009]` for Client D1 not storing authoritative model policy body or secrets.
- [ ] 6.9 Add/update Client RPC tests named with `[CLIENT-REGISTRY-S010]` for Client server reading policy truth from Agent RPC and returning safe Browser data.
- [ ] 6.10 Add `tests/e2e/management-model-policy.spec.ts` with Playwright tests titled `[CLIENT-MANAGEMENT-S017]` and `[CLIENT-MANAGEMENT-S018]`.

## 7. Final Verification and Documentation Sync

- [ ] 7.1 Re-run `pnpm gen:agent:proto && pnpm gen:agent:rpc` and inspect generated drift only under command-owned outputs.
- [ ] 7.2 Run `pnpm check:codegen` and fix descriptor inventory, field stability, and generated drift issues.
- [ ] 7.3 Run `pnpm check:agent && pnpm test:agent` and fix Agent contract/runtime/storage/security failures.
- [ ] 7.4 Run `pnpm check:client && pnpm test:client` and fix Client UI/server-only/boundary failures.
- [ ] 7.5 Run `pnpm test:e2e` for Management Client model policy flow and browser secrecy.
- [ ] 7.6 Run `pnpm lint` and fix OpenSpec validation, Scenario ID coverage, governance, ESLint, and supply-chain failures.
- [ ] 7.7 Update `openspec/changes/complete-autonomous-agent-runtime/design.md`, `tasks.md`, and delta specs if implementation changes any file scope, scenario mapping, or verification command.
- [ ] 7.8 Capture staging smoke notes for Event publish with default policy and Event publish with override policy, using only safe metadata and digests.
