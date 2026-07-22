---
name: coding-guardian
description: Enforce this repository's real Agent/Client foundation, TypeSpec-to-proto codegen, Next.js Client boundaries, and OpenSpec rules while editing code, docs, or tooling.
---

# Coding Guardian

この skill は、このリポジトリで実際に fail する規約と検証フローから外れないようにガードします。

- 返答言語: `AGENTS.md` に従う
- 重要: まず `CODING_STANDARDS.md` と enforcement entrypoint を読む
- 重要: Agent API 契約の正は `packages/agent/src/typespec/main.tsp` で、OpenAPI ではなく proto3/RPC descriptors を生成する
- 重要: `@cf-tamac/sdk` は server-side Agent RPC SDK である。Browser-visible module は SDK、Connect runtime、generated RPC descriptor、credential、JWT signing を import しない
- 重要: 生成物は手編集しない。`packages/agent/proto/**`、`packages/agent/src/generated/rpc/**`、`packages/client/src/generated/agent-rpc/**`、`packages/sdk/src/generated/agent-rpc/**` は command-owned
- 重要: Client Service は Ed25519 JWT を使う `TamacAgentClient` の server-side surface、Integration Provider は Ed25519 detached signature を使う `TamacProviderIngressClient` の three-method ingress surface として分離する。JWT、acting user、Client D1 context を Provider surface に渡さない
- 重要: Client Service JWT の送信先は server-managed `AGENT_RPC_ALLOWED_ORIGINS` で承認された canonical HTTPS origin だけに限定し、Browser registration と Client D1 record は signing key、acting user、SDK transport を解決する前に再検証する
- 重要: Agent foundation では `packages/agent/**` が Cloudflare Agents SDK / Durable Object / Connect RPC Worker、`packages/client/**` が Next.js on Cloudflare Workers management Client
- 重要: `pnpm lint` には OpenSpec validate、Scenario coverage check、supply-chain policy check が含まれる

## Workflow

### 1) Load the repository rules before editing

最初に次を読む。

- `AGENTS.md`
- `CODING_STANDARDS.md`
- `CONTRIBUTING.md`
- `.opencode/skills/coding-guardian/references/repo-entrypoints.md`

特に重要な enforcement entrypoint:

- root flow: `package.json`, `.github/workflows/ci.yml`, `.husky/pre-commit`, `.husky/commit-msg`, `.lintstagedrc.json`, `commitlint.config.js`, `eslint.config.js`
- Agent foundation: `packages/agent/package.json`, `packages/agent/wrangler.toml`, `packages/agent/src/index.ts`, `packages/agent/src/AIAgent.ts`, `packages/agent/src/rpc/**`, `packages/agent/src/storage/schema/agent-storage.ts`
- Agent TypeSpec / proto / RPC codegen: `packages/agent/src/typespec/main.tsp`, `packages/agent/src/typespec/tspconfig.yaml`, `packages/agent/buf.yaml`, `packages/agent/buf.gen.yaml`, `scripts/codegen/check-agent-codegen-drift.mjs`
- SDK foundation: `packages/sdk/package.json`, `packages/sdk/src/**`, `packages/sdk/src/generated/agent-rpc/**`, `packages/sdk/src/tests/**`
- Client foundation: `packages/client/package.json`, `packages/client/wrangler.toml`, `packages/client/next.config.ts`, `packages/client/open-next.config.ts`, `packages/client/app/**`, `packages/client/src/server/**`
- Client destination policy: `packages/client/src/server/agent-rpc/origin-policy.ts`, `packages/client/src/server/agent-rpc/agent-loader.ts`, `packages/client/src/server/agent-rpc/safe-results.ts`
- Governance: `scripts/governance/verify-agent-surface.mjs`, `scripts/governance/verify-package-boundaries.mjs`, `scripts/security/verify-pnpm-supply-chain.mjs`, `scripts/openspec/verify-scenario-coverage.mjs`
- Removed demo package graph: old demo contract/server/UI packages are no longer active implementation sources
- OpenSpec: `scripts/openspec/verify-change-intent.mjs`, `scripts/openspec/verify-scenario-coverage.mjs`, `scripts/openspec/verify-change-task-scope.mjs`, `scripts/openspec/verify-wireframe-previews.mjs`

### 2) Classify the change before editing

- Agent contract / codegen: `packages/agent/src/typespec/**`, `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, `packages/client/src/generated/agent-rpc/**`, `packages/sdk/src/generated/agent-rpc/**`, `scripts/codegen/**`
- Agent runtime: `packages/agent/src/**`, excluding generated RPC output
- SDK runtime: `packages/sdk/src/**`, excluding command-owned generated Agent RPC descriptors and tests; it is a server-side typed consumer, not an Agent or Client runtime replacement
- Management Client: `packages/client/app/**`, `packages/client/src/server/**`, `packages/client/src/tests/**`, excluding generated Agent RPC output
- Workspace governance: `scripts/governance/**`, `scripts/security/**`, `scripts/openspec/**`, `.opencode/**`
- Tooling / workflow: root config, scripts, hooks, CI, `.opencode/**`

固定の依存方向:

- Agent: Worker entrypoint -> RPC adapter/router/interceptors -> service modules -> Agent domain/runtime modules -> Agent-owned storage/observability/types
- SDK: server-side consumer -> SDK-owned generated Agent RPC descriptors -> Connect unary binary Protobuf; SDK runtime must not import Agent or Client runtime source
- Client: App Router/browser-visible modules -> Server Components/Server Actions -> server-only Client SDK adapter -> Client D1 repositories / encrypted signing-key store -> `@cf-tamac/sdk`
- Agent/Client foundation: `packages/agent/src` must not import `packages/client/src`; Client server-only modules may import `@cf-tamac/sdk`, but must not import `packages/agent/src/**`; browser-visible Client modules must not import SDK, Connect runtime, generated RPC descriptors, credentials, or JWT signing
- Agent codegen direction: `packages/agent/src/typespec -> packages/agent/proto -> packages/agent/src/generated/rpc`, `packages/client/src/generated/agent-rpc`, and `packages/sdk/src/generated/agent-rpc`

### 3) Implement without breaking enforced rules

- Agent contract を変えるときは `packages/agent/src/typespec/**` を直し、`pnpm gen:agent:proto`、`pnpm gen:agent:rpc`、`pnpm check:codegen` で Agent、Client、SDK descriptor を整合させる。`packages/agent/proto/**` と `packages/**/src/generated/**` は手で直さない
- Agent public API は Protobuf RPC-only。Agent REST resource route、Agent OpenAPI artifact、Orval-generated Agent client、ad-hoc JSON DTO API、public Durable Object fetch API、browser-direct Agent RPC を追加しない
- Agent Connect Worker は binary Protobuf unary profile を守る。production path では JSON encoding と HTTP GET を許可しない
- Provider ingress は `PublishEvent`、`PublishToolResult`、`PublishDeliveryResult` だけを detached-signature surface とする。Agent は fixed `300_000` ms timestamp window、active Installation/trust key、unsigned Protobuf digest、Ed25519 signature を検証してから `INTEGRATION_INSTALLATION` principal を作り、nonce/idempotency reservation と Agent-local final authorization を行う。Provider 自己申告の skew を trust source にしない
- Every public Agent RPC request body keeps `agent_id`; command requests keep `idempotency_key`; Event publish requests keep non-empty NFC-normalized `thread_key` of at most 512 UTF-8 bytes
- `packages/agent/wrangler.toml` は `AI_AGENT` Durable Object binding と Agent-owned blob storage を持ち、D1、`CLIENT_DB`、Cloudflare Queues producer/consumer bindings を持たない
- `packages/client/wrangler.toml` は `CLIENT_DB` と credential secret references を持ち、`AI_AGENT` と Agent-owned storage bindings を持たない
- Client は `/api/client/*`、`/api/agent*`、Agent REST proxy、arbitrary RPC forwarding route を追加しない。Server Actions / Server Components は UI 内部境界として扱う
- Client server-only SDK adapter は Client D1、encrypted Client Service signing key store、acting user policy、managed Agent resolution を所有し、それらから解決した server-side context を `@cf-tamac/sdk` に渡す。SDK に Client storage、Next.js `server-only` marker、Worker env resolution を移さない
- `AGENT_RPC_ALLOWED_ORIGINS` は unique canonical HTTPS origins の non-empty JSON array とする。configuration literal は `URL.origin` と完全一致させ、registration input は canonicalize 後に exact match で承認する。policy/configuration failure は credential、signing key、origin detail を返さず、Browser-safe result の `configuration` category と correlation ID に投影する
- SDK-backed Server Action は成功・失敗とも `displayData`、`safeStatus`、`safeErrorCategory`、`correlationId` の四属性に閉じる。raw Connect/SDK diagnostics、JWT、credential、signing key、origin policy detail を Browser に返さない
- `packages/client` は Agent domain snapshots を Client D1 に保存しない。Client D1 は managed Agent records、credential references、encrypted Client Service signing key store だけを所有する
- `.opencode` guidance を更新するときは `packages/agent/**`、`packages/sdk/**`、`packages/client/**` を implementation/review scope として認識させ、4つの generated RPC output の hand edit permission を追加しない
- SDK descriptor root `packages/sdk/src/generated/agent-rpc/**` は Agent/Client descriptor と同じ mandatory generated-policy target である。TypeSpec/proto contract 変更時は `pnpm gen:agent:proto && pnpm gen:agent:rpc` でのみ再生成し、`pnpm check:codegen` で Agent→Client/SDK parity を確認する
- `scripts/codegen/check-agent-codegen-drift.mjs` を変更するときは、input snapshot を一度だけ収集する responsibility-specific collector と deterministic issue order を保つ。`pnpm lint:eslint` の cognitive-complexity warning は zero を維持する
- Do not use the old demo package graph as an architecture or implementation source
- `packages/**/src/**/*.{ts,tsx}` の export は、生成物とテストを除き TSDoc を付ける
- OpenSpec を触るときは `openspec/specs/**/spec.md` の Scenario ID とテストタイトルの参照を崩さない

### 4) Verify with the real repo flow

変更内容に応じて、少なくとも次を実行する。

- Agent contract / generated 変更: `pnpm gen:agent:proto` -> `pnpm gen:agent:rpc` -> `pnpm check:codegen`
- SDK generated descriptor policy / codegen collector 変更: `pnpm check:codegen`、`pnpm lint:eslint`、`pnpm test:governance`
- SDK-focused 変更: `pnpm --filter @cf-tamac/sdk check` と `pnpm --filter @cf-tamac/sdk test`
- Agent/Client foundation 変更: relevant package checks/tests plus `pnpm lint`
- Client origin policy / Browser-safe result 変更: `pnpm test:client`、`pnpm lint:governance`、staging で canonical allowlist の registration と stored-origin revalidation、safe correlation ID を確認
- Governance 変更: relevant script tests plus `pnpm lint`
- JS / TS / TSX 変更: `pnpm lint` -> `pnpm test:run`
- Client-focused 変更: `pnpm test:client`
- Agent-focused 変更: `pnpm test:agent`
- Release-ready な変更や横断変更: `pnpm build`
- Skill 変更: `python3 .opencode/skills/opencode-skills-devkit/scripts/validate_skills.py --root .`

Changed-file 向けの軽量チェック:

- `.opencode/skills/coding-guardian/scripts/check_changed.sh [base]`

### 5) What to report back

- 触った領域
- どの enforced rule に合わせて設計したか
- 生成が必要だったか、実行したか
- 実行した command と結果
- まだ未実行の verify があれば、その理由

## Common violations to prevent

- generated file の手編集
- Agent generated proto/RPC output の手編集
- Agent REST/OpenAPI/Orval/JSON DTO surface の追加
- Agent Worker への D1、`CLIENT_DB`、Cloudflare Queues binding 追加
- Client Worker への `AI_AGENT` binding 追加
- Client への Agent API proxy route、browser-direct Agent RPC、Agent credential exposure の追加
- `packages/agent/src` と `packages/client/src` の runtime-source import coupling
- `.opencode` guidance が古い demo template path だけを実装基準にすること
- export に必要な TSDoc がない
- OpenSpec の Scenario ID とテスト参照の不整合
