---
name: coding-guardian
description: Enforce this repository's Agent, Management Client, SDK, TypeSpec-to-proto, OpenSpec, delivery, and verification rules while editing code, documentation, or tooling.
---

# Coding Guardian

Keep changes aligned with the rules and command paths that actually fail in this repository.

- Follow `AGENTS.md` for communication language.
- Read `docs/change-operation.md`, `CODING_STANDARDS.md`, and the enforcement entrypoints before editing.
- Treat `packages/agent/src/typespec/main.tsp` as the Agent API contract source of truth.
- Never hand-edit generated artifacts.
- Treat `tamac-sdk` as a server-side Agent RPC SDK. Browser-visible modules never import the SDK, Connect runtime, generated RPC descriptors, credentials, or JWT signing.
- Keep Client Service Ed25519 JWT operations separate from Provider Ed25519 detached-signature ingress.

## Workflow

### 1. Load Repository Rules

Read:

- `AGENTS.md`
- `docs/change-operation.md`
- `CODING_STANDARDS.md`
- `CONTRIBUTING.md`
- `.opencode/skills/coding-guardian/references/repo-entrypoints.md`

Important enforcement entrypoints:

- Root: `package.json`, `.github/workflows/ci.yml`, `.husky/pre-commit`, `.husky/commit-msg`, `.lintstagedrc.json`, `commitlint.config.js`, `eslint.config.js`
- Agent: `packages/agent/package.json`, `packages/agent/wrangler.toml`, `packages/agent/src/index.ts`, `packages/agent/src/AIAgent.ts`, `packages/agent/src/rpc/**`, Agent-owned storage
- TypeSpec/codegen: Agent TypeSpec, proto and Buf configuration, generated Agent/Client/SDK descriptors, `scripts/codegen/check-agent-codegen-drift.mjs`
- SDK: `packages/sdk/package.json`, SDK runtime, SDK-generated descriptors, SDK tests
- Management Client: `packages/client/package.json`, Worker and Next.js configuration, `packages/client/app/**`, `packages/client/src/server/**`
- Security boundaries: Client destination policy, encrypted signing-key storage, browser-safe results, Provider ingress authentication and admission
- Governance: `scripts/governance/**`, `scripts/security/**`, `scripts/openspec/**`
- OpenSpec: generated core commands and skills, both custom schemas, and the proposal, Scenario coverage, and task/design scope validators
- Pull requests: `.github/pull_request_template.md` and `.github/workflows/validate-pr-template.yml`

### 2. Classify Before Editing

- Select `Operation Lane` from `DIRECT | BEHAVIOR | ARCHITECTURE`.
- Select `UX Mode` independently from `NONE | CONTINUITY | SHAPE`.
- Select `Review Depth` independently from `STANDARD | DEEP`.
- `DIRECT` changes neither observable behavior nor material architecture.
- `BEHAVIOR` uses `behavior-change`.
- `ARCHITECTURE` uses `architecture-change`.
- Use `DEEP` for material security, data, external-contract, migration, cross-domain architecture, or active-Change interaction risk.

Area mapping:

- Agent contract/codegen: `packages/agent/**`, Agent TypeSpec, proto, generated descriptors, and codegen scripts
- Agent runtime: handwritten `packages/agent/src/**`
- SDK runtime: handwritten `packages/sdk/src/**`
- Management Client: `packages/client/**`, Client app, server-only modules, and tests
- Delivery and package distribution: production workflow, preflight, package, release, and governance sources
- Tooling/workflow: root configuration, scripts, hooks, CI, OpenSpec, and `.opencode/**`

Dependency directions:

- Agent: Worker entrypoint -> RPC adapter/router/interceptors -> service modules -> Agent domain/runtime -> Agent-owned storage/observability/types
- SDK: server-side consumer -> SDK-owned generated Agent RPC descriptors -> Connect unary binary Protobuf
- Management Client: App Router/browser-visible modules -> Server Components/Server Actions -> server-only SDK adapter -> Client D1 repositories/encrypted signing-key store -> `tamac-sdk`
- TypeSpec: Agent TypeSpec -> generated proto -> Agent, Management Client, and SDK RPC descriptors
- Agent runtime never imports Management Client runtime. Management Client server-only code may import `tamac-sdk`, but never Agent runtime source.

### 3. Preserve Enforced Boundaries

- Change Agent TypeSpec first, then run `pnpm gen:agent:proto`, `pnpm gen:agent:rpc`, and `pnpm check:codegen`.
- Never edit Agent proto or generated Agent/Client/SDK RPC output manually.
- Never edit `.opencode/commands/opsx-*.md` or `.opencode/skills/openspec-*/SKILL.md` manually; regenerate both with `pnpm gen:openspec` from OpenSpec `1.8.0`.
- Keep Agent public APIs Protobuf RPC-only. Do not add Agent REST, OpenAPI, Orval, ad-hoc JSON DTO, public Durable Object fetch, or browser-direct Agent RPC surfaces.
- Keep the Agent Connect Worker on unary binary Protobuf. Production paths reject JSON encoding and HTTP GET.
- Preserve `agent_id` on public Agent RPC request bodies, `idempotency_key` on commands, and the normalized bounded `thread_key` contract on Event publication.
- Keep Agent bindings limited to Agent-owned Durable Object and blob resources. Keep Client D1 and Client credential resources in the Management Client.
- Keep Provider ingress limited to `PublishEvent`, `PublishToolResult`, and `PublishDeliveryResult`. Validate the fixed timestamp window, active installation/trust key, unsigned Protobuf digest, Ed25519 signature, identity, nonce/idempotency, and Agent-local authorization before mutation.
- Require `AGENT_RPC_ALLOWED_ORIGINS` approval before resolving a Client Service signing key, acting user, or SDK transport. Revalidate both browser registration input and stored Client D1 origins.
- Return only `displayData`, `safeStatus`, `safeErrorCategory`, and a secret-free `correlationId` to browser-visible code. Never expose raw SDK diagnostics, JWTs, credentials, signing keys, or origin-policy details.
- Client D1 owns managed Agent records, credential references, and encrypted Client Service signing keys. It never stores Agent domain snapshots, plaintext secrets, private JWK plaintext, or raw JWTs.
- Add the required detailed Japanese TSDoc to public package exports, except generated and test code.
- Preserve `minimumReleaseAge: 4320`, package-specific `allowBuilds`, and the ban on `dangerouslyAllowAllBuilds` and `minimumReleaseAgeExclude`.
- OpenSpec persists observable behavior, not a file-level implementation plan.
- Keep `tasks.md` as coarse Work Packages; decide files, helpers, test layers, and local order progressively during implementation.
- Preserve Scenario IDs across main Specs, active deltas, and test titles.
- Validate one Change while planning with `node scripts/openspec/verify-scenario-coverage.mjs --change <change-id>`, require full test references at apply completion with the same command plus `--require-test-references`, then run the global active-Change check.
- Actual UI changes require a product designer and real desktop/mobile browser review. Generated mockups are optional non-contract evidence.
- PRs record Operation Lane, UX Mode, Review Depth, OpenSpec Change, and Scenario IDs. `BEHAVIOR` and `ARCHITECTURE` require a Change and Scenario IDs.
- Ask before dependency, version, or permission-boundary changes. Never perform a release, publication, deployment, environment mutation, credential access, or external approval as repository completion evidence.
- Do not use the removed demonstration package graph as an architecture or implementation source.

### 4. Verify Through Real Commands

- Agent contract/generated changes: `pnpm gen:agent:proto`, `pnpm gen:agent:rpc`, `pnpm check:codegen`
- SDK changes: `pnpm --filter tamac-sdk check`, `pnpm --filter tamac-sdk test`
- Agent changes: `pnpm test:agent`
- Management Client changes: `pnpm test:client`
- Governance changes: `pnpm test:governance`, relevant `pnpm check:*` commands
- OpenSpec changes: `pnpm lint:openspec`
- PR template/validator changes: workflow policy or validator fixture tests when present
- JavaScript/TypeScript changes: `pnpm lint`, `pnpm test:run`
- Cross-cutting or release-ready changes: `pnpm build`
- Skill changes: `python3 .opencode/skills/opencode-skills-devkit/scripts/validate_skills.py --root .`

Changed-file helper:

```bash
.opencode/skills/coding-guardian/scripts/check_changed.sh [base]
```

### 5. Report

Report the touched areas, enforced rules applied, generation performed, commands and results, and any verification that could not run.

## Prevent These Violations

- Hand-editing generated proto or RPC descriptors
- Adding Agent REST/OpenAPI/Orval/JSON/browser-direct surfaces
- Mixing Agent, SDK, and Management Client runtime ownership
- Mixing Client Service JWT and Provider detached-signature trust
- Resolving credentials before destination approval
- Exposing server-only diagnostics or secrets to browser-visible code
- Weakening supply-chain controls
- Scenario/Test traceability drift
- Collapsing Operation Lane and UX Mode into one classification
- Turning OpenSpec into a file-, helper-, or test-layer implementation plan
- Treating release, publication, deployment, or external-system state as Change completion evidence
