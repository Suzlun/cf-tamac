# Staging Smoke Notes

## Scope

- Change: `complete-autonomous-agent-runtime`.
- Capture date: 2026-06-25.
- Covered smoke flows: Event publish with the Agent default model policy, Event publish with an Event-scoped override policy, and rejected unauthorized override.
- Safety rule: capture only Agent ID, policy ref, policy digest, request/response digest, status, failure category, safe model metadata, and safe generation parameter values. Do not capture Agent credential, Provider credential, raw prompt, raw completion, raw reasoning, Thread payload body, or Memory body.

## Observed Local Evidence

| Command                                                                                                                                                   | Observed Result                                                                                                      | Safe Coverage                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check:agent`                                                                                                                                        | `tsc -p tsconfig.json --noEmit` completed without errors.                                                            | Agent storage/runtime/provider type flow compiles after model policy generation parameter propagation.                                                                                                                         |
| `pnpm check:client`                                                                                                                                       | `tsc -p tsconfig.json --noEmit` completed without errors.                                                            | Client server-only policy payload construction compiles with decision schema `v1`.                                                                                                                                             |
| `pnpm --filter @cf-tamac/agent test -- src/tests/agent-model-policy.test.ts src/tests/agent-model-invocation.test.ts src/tests/agent-run-runtime.test.ts` | Vitest reported `33 passed` test files and `126 passed` tests.                                                       | Verifies safe policy persistence, saved generation metadata restoration, `v1` decision parsing, Run snapshot policy source, provider request generation parameters, invocation digest-only storage, and model failure secrecy. |
| `pnpm --filter @cf-tamac/client test -- src/tests/client-model-policy-save.test.ts`                                                                       | Vitest reported `17 passed` test files and `85 passed` tests.                                                        | Verifies Client model policy payload uses decision schema `v1`, inline safe generation JSON, server-only Agent RPC boundary, and Browser-safe error mapping.                                                                   |
| `pnpm format:check`                                                                                                                                       | Prettier reported all matched files use code style.                                                                  | Ensures smoke artifact and changed TS files are formatter-stable.                                                                                                                                                              |
| `pnpm lint`                                                                                                                                               | ESLint, OpenSpec strict validation, scenario coverage, governance, and supply-chain checks completed without errors. | Verifies OpenSpec Scenario IDs, Agent/Client boundaries, generated-output policy, and security governance.                                                                                                                     |
| `pnpm check`                                                                                                                                              | Agent and Client package type checks completed without errors.                                                       | Verifies repository-wide TypeScript consistency.                                                                                                                                                                               |
| `pnpm test:run`                                                                                                                                           | Vitest reported `55 passed` test files and `225 passed` tests.                                                       | Verifies all unit suites after model policy/runtime/client changes.                                                                                                                                                            |
| `pnpm check:codegen`                                                                                                                                      | TypeSpec/proto/RPC generation and generated-output drift check completed without errors.                             | Verifies generated proto/RPC outputs remain command-owned and consistent.                                                                                                                                                      |
| `pnpm test:e2e`                                                                                                                                           | Playwright reported `17 passed` and `1 skipped` with `workers: 1`.                                                   | Verifies Management Client registration/settings model policy flow and Browser secrecy through the server-only E2E Agent RPC seam where the Agent RPC-backed settings path is reachable.                                       |
| `pnpm build`                                                                                                                                              | Agent `tsc --noEmit` and Client `next build` completed successfully.                                                 | Verifies release build readiness for Agent and Management Client packages.                                                                                                                                                     |
| `git diff --check`                                                                                                                                        | Completed with no whitespace errors.                                                                                 | Verifies patch whitespace cleanliness.                                                                                                                                                                                         |
| `git diff --cached --check`                                                                                                                               | Completed with no whitespace errors.                                                                                 | Verifies staged generated and implementation diff whitespace cleanliness.                                                                                                                                                      |

## External Staging Evidence Format

Record only the fields below when an external staging Worker with Workers AI `AI` binding is available. If a value was not directly observed, leave it absent rather than replacing it with an expected value.

### Smoke 1: Default Policy Event Publish

| Field                        | Safe Evidence Rule                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `scenario_ids`               | `AGENT-RUNTIME-S011`, `AGENT-RUNTIME-S012`, `AGENT-MODEL-POLICY-S005`, `AGENT-SECURITY-S017`.        |
| `agent_id`                   | Staging Agent ID only.                                                                               |
| `thread_key_digest`          | SHA-256 digest of normalized thread key.                                                             |
| `event_payload_digest`       | SHA-256 digest of Event payload bytes.                                                               |
| `requested_model_policy_ref` | Must be absent for default policy smoke.                                                             |
| `event_acceptance_status`    | Observed RPC result status only.                                                                     |
| `run_status`                 | Observed Run status only.                                                                            |
| `model_policy_source`        | Observed Run snapshot source.                                                                        |
| `resolved_policy_ref`        | Observed Agent-owned policy ref.                                                                     |
| `resolved_policy_digest`     | Observed Agent-owned policy digest.                                                                  |
| `provider`                   | Safe provider identifier, expected product value is `workers-ai` but record only the observed value. |
| `model_id`                   | Safe Workers AI model identifier.                                                                    |
| `generation_parameters`      | Safe numeric settings only: `max_tokens`, `temperature`, `top_p`.                                    |
| `request_digest`             | Prompt/context digest only.                                                                          |
| `response_digest`            | Provider response digest only when a model call completed.                                           |
| `failure_category`           | Classified safe failure category when the Run did not complete.                                      |

### Smoke 2: Override Policy Event Publish

| Field                        | Safe Evidence Rule                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `scenario_ids`               | `AGENT-EVENTING-S010`, `AGENT-MODEL-POLICY-S006`, `AGENT-SECURITY-S016`, `AGENT-RUNTIME-S012`. |
| `agent_id`                   | Staging Agent ID only.                                                                         |
| `thread_key_digest`          | SHA-256 digest of normalized thread key.                                                       |
| `event_payload_digest`       | SHA-256 digest of Event payload bytes.                                                         |
| `requested_model_policy_ref` | Agent-owned policy ref only; never raw provider/model request body.                            |
| `event_acceptance_status`    | Observed RPC result status only.                                                               |
| `run_status`                 | Observed Run status only.                                                                      |
| `model_policy_source`        | Observed Run snapshot source.                                                                  |
| `resolved_policy_ref`        | Observed Agent-owned policy ref.                                                               |
| `resolved_policy_digest`     | Observed Agent-owned policy digest.                                                            |
| `provider`                   | Safe provider identifier.                                                                      |
| `model_id`                   | Safe Workers AI model identifier.                                                              |
| `generation_parameters`      | Safe numeric settings only: `max_tokens`, `temperature`, `top_p`.                              |
| `request_digest`             | Prompt/context digest only.                                                                    |
| `response_digest`            | Provider response digest only when a model call completed.                                     |
| `failure_category`           | Classified safe failure category when the Run did not complete.                                |

### Smoke 3: Rejected Override

| Field                        | Safe Evidence Rule                                                       |
| ---------------------------- | ------------------------------------------------------------------------ |
| `scenario_ids`               | `AGENT-EVENTING-S011`, `AGENT-SECURITY-S016`.                            |
| `agent_id`                   | Staging Agent ID only.                                                   |
| `requested_model_policy_ref` | Unauthorized, archived, disabled, not found, or grant-excluded ref only. |
| `event_acceptance_status`    | Observed rejection status only.                                          |
| `failure_category`           | `permission_denied`, `not_found`, or `failed_precondition` if observed.  |
| `side_effect_count`          | Observed count for Event, pending Run, and scheduler wake writes.        |

## Rejection Criteria

- Reject the smoke artifact if any raw prompt, raw completion, raw reasoning, credential, signature material, Thread payload body, or Memory body appears in logs, RPC response, Client UI, Browser storage, or captured notes.
- Reject the smoke artifact if a Run starts without an observed active model policy ref and digest.
- Reject the smoke artifact if Workers AI binding is missing but health or Run status reports serving capability.
- Reject the smoke artifact if an unauthorized, disabled, archived, not found, or grant-excluded override creates an Event, pending Run, or scheduler wake.
