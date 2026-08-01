## Primary Rules

- **MUST Think in English**; **MUST respond in Japanese**; **NEVER NOT use in Other Langages**
- You MUST doubt your assumptions, verify factual claims against available evidence, and MUST NOT present unsupported statements as facts.
- Write `AGENTS.md` in English. Pull request bodies and pull request template content MUST be written in Japanese, except for code identifiers, commands, logs, file paths, and issue or PR references.

## Intent Before Implementation

- Treat the user's wording as evidence of intent, not automatically as an implementation-ready specification.
- Before selecting a solution, identify the customer outcome and verify the relevant repository facts and constraints.
- Classify solution-shaped terms as a required outcome, a non-negotiable constraint, or a candidate means. Do not promote candidate means into requirements without evidence or confirmation.
- Separate observations from inferences and assumptions. Familiarity, common practice, and readily available example code are not evidence that a solution fits this repository.
- Ask the user only when unresolved ambiguity could materially change user-visible behavior, external contracts, architecture, security, data, dependencies, or scope.
- When a workflow provides confirmed intent or an approved specification, preserve that boundary and choose implementation details within it unless contradictory evidence requires escalation.

## Credo

Before beginning any work, you MUST summarize your understanding of the Credo below in Japanese and explicitly declare that you will strictly comply with it. Do not translate or repeat the Credo verbatim; explain how you will apply it to the current task, then begin the work.

1. あらゆる意思決定は顧客ファーストで考えること。誰がどのように利用し、どうすれば喜ばれるかを常に考えること。
2. セキュリティはなによりも優先されること。セキュリティ最優先が、なにより顧客のためになる。
3. 後方互換性は完全悪だ。後方互換性のためのコードや計画がある時点で、そのシステムは一切認められない。常に完璧なプロダクトであるために、不要な機能は即座に削除。
4. 全てのアーキテクチャは保守性のためにある。同じレイヤーの中で同じコードは二度と書くな。コピペはするな。抽象化して考えろ。アーキテクチャで説明できない再実装や再記入は存在してはならない。
5. すべてのルールには意図がある。必ず意図を理解すること。意図を理解しないまま改定したり、逆に遵守しようとしてはならない。
6. 常に完璧なプロダクトであること。妥協、横着、顧客にとって意味のないプロダクトを作ることは一切許されない。仮置きを残す、後回し、コメントにしておいて放置に決してしてはならない。後回しという言葉は発することするら厳禁である。最小実装などという言葉は何があっても使ってはならないし、問題の本質的な解決以外の解決は一切認めない。
7. いかなる理由があろうと、クレドに違反しないこと、クレド違反を放置しないことを最優先とすること。どのクレドによって肯定しうるのか、その作業内容が一切クレドに違反しないことを必ず方針の前に声に出して報告しなければならない。

## Code Comments

- Leave detailed Japanese comments for every single process in the code.
- Clarify the intent, input/output, and side effects of each step so that future readers (including yourself) can understand immediately.

## Documentation Comments (TS Docs)

- TSDoc (TypeScript) comments must be written in Japanese, providing detailed, multi-line explanations of their roles and parameter meanings.
- Every public API (functions, methods, types, interfaces, and structs) must have a documentation comment in Japanese that describes what it does, the meaning of each argument and return value, error cases, and usage examples.

## Commands

- Install: `corepack enable && pnpm install`
- Dev (Agent Worker): `pnpm dev:agent`
- Dev (Management Client): `pnpm dev:client`
- Build Agent, SDK, and Management Client: `pnpm build`
- Check Agent/Client: `pnpm check:agent && pnpm check:client`

## API Contract (TypeSpec)

- Agent public API source of truth: `packages/agent/src/typespec/main.tsp`
- Agent generated proto: `packages/agent/proto/cftamac/agent/v1.proto`
- Agent generated RPC outputs: `packages/agent/src/generated/rpc/**`, `packages/client/src/generated/agent-rpc/**`, and `packages/sdk/src/generated/agent-rpc/**`
- Regenerate Agent proto + RPC SDK: `pnpm gen:agent:proto && pnpm gen:agent:rpc`
- Regenerate all generated API outputs: `pnpm gen`
- Codegen drift check (CI-style): `pnpm check:codegen`
- Do not model Agent APIs with OpenAPI or Orval.

## Testing

- All unit tests: `pnpm test:run`
- Agent tests: `pnpm test:agent`
- Management Client tests: `pnpm test:client`
- Governance tests: `pnpm test:governance`
- E2E: `pnpm test:e2e`

## Pull Requests

- Always use `.github/pull_request_template.md` when creating a pull request, and fill every template item completely with no blank fields.
- Write the pull request body in Japanese. Code identifiers, commands, logs, file paths, and issue or PR references may remain in their original form.
- Do not delete sections or checklist items that do not apply. Instead, write `なし（理由: ...）` or a concrete reason explaining why the item does not apply.
- Check every checklist item after writing the applicable confirmation or non-applicable reason. Do not leave unchecked items in the pull request body.
- For pull requests with UI / UX changes, attach screenshots in all of these sections: `Desktop Before`, `Desktop After`, `Mobile Before`, and `Mobile After`.
- The pull request body is validated by `.github/workflows/validate-pr-template.yml`; when using any pull request creation tool, read the template first and prepare a body that passes this validation.

## Supply Chain

- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 4320` (72 hours); do not lower or bypass it.
- Dependency additions/updates must land at least 72 hours before release, unless an explicitly reviewed emergency exception is approved.
- New dependency build scripts require package-by-package approval through `allowBuilds`; never enable `dangerouslyAllowAllBuilds`.

## Architecture Notes

- Product shape: Cloudflare Workers 上で動作する自律駆動 AI Agent microservice と Management Client。
- Aggregate boundary: `1 Agent ID = 1 AIAgent Durable Object instance = 1 AI Agent aggregate root`.
- Agent dependency direction: Worker entrypoint -> RPC adapter/router/interceptors -> service modules -> Agent domain/runtime modules -> Agent-owned storage/observability/types.
- Management Client direction: App Router/browser-visible modules -> Server Components/Server Actions -> server-only modules -> Client D1 repositories / generated Agent RPC client.
- Agent API contract direction: implementation must follow `packages/agent/src/typespec`; do not model Agent APIs with OpenAPI or Orval.
- Agent Worker (`packages/agent`) exposes Protobuf RPC-only via Connect unary binary Protobuf. Accept `POST` + `Content-Type: application/proto`; reject JSON/GET and fail closed for unmapped generated methods.
- Agent Worker owns `AI_AGENT` Durable Object and Agent blob storage only. It must not use `CLIENT_DB`, Agent-cross D1, Cloudflare Queues bindings, public Durable Object fetch APIs, REST/OpenAPI/Orval Agent surfaces, or ad-hoc JSON DTO APIs.
- Agent-local Queue is only a scheduler wake/coalescing boundary; accepted Events, pending Runs, Thread identity, replay/idempotency, audit, and authoritative rate-limit state stay in `AIAgent` Durable Object SQLite storage. A Cloudflare `RateLimit` binding may provide a pre-auth edge admission guard only; its external bucket window is not Agent domain state, and its denial path must finish before raw body, signature, or Agent mutation handling.
- Management Client (`packages/client`) owns `CLIENT_DB`, credential references, and encrypted Client Service signing key store only. It may call Agent RPC from server-only modules, but browser bundles must not contain Agent credentials, private JWK, encrypted private JWK, raw JWT, direct Agent RPC invocation logic, Agent runtime imports, or Agent API proxy routes.
- Client D1 may store managed Agent records, external credential references, and encrypted Client Service signing key records protected by `CLIENT_CREDENTIAL_ENCRYPTION_KEY`; it must not store Agent domain snapshots, plaintext secrets, or private JWK plaintext.
- Operations runbook: `docs/operations/agent-control-plane-auth.md` describes `AGENT_CONTROL_PLANE_TRUST`, signing key generation/export, Agent Worker secret setup, rotation, emergency revoke, break-glass recovery, staging smoke, health verification, and private-key non-exposure.

## OpenSpec (Spec -> Test Contract)

- Product contract scenarios live in OpenSpec `spec.md` files.
- Every `#### Scenario:` heading MUST end with a stable Scenario ID: `(...-S001)`
  - Example: `#### Scenario: Initialize an Agent (AGENT-LIFECYCLE-S001)`
- Automated tests MUST reference Scenario IDs in the test title using brackets:
  - Example: `it('[AGENT-LIFECYCLE-S001] Initialize an Agent', async () => { ... })`
- To explicitly opt out of automation for a scenario, add `Tags: manual` under the scenario heading
- Guardrails are enforced by `pnpm lint`:
  - `pnpm exec openspec validate --all --strict`
  - Scenario ID coverage check (`scripts/openspec/verify-scenario-coverage.mjs`)
  - Coverage check uses `openspec/specs/**` as the contract (sync/archive deltas if you are working in `openspec/changes/**`)
