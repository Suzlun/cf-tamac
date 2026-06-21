---
name: coding-guardian
description: Enforce this repository's real Agent/Client foundation, TypeSpec-to-proto codegen, Next.js Client boundaries, and OpenSpec rules while editing code, docs, or tooling.
---

# Coding Guardian

この skill は、このリポジトリで実際に fail する規約と検証フローから外れないようにガードします。

- 返答言語: `AGENTS.md` に従う
- 重要: まず `CODING_STANDARDS.md` と enforcement entrypoint を読む
- 重要: Agent API 契約の正は `packages/agent/src/typespec/main.tsp` で、OpenAPI ではなく proto3/RPC descriptors を生成する
- 重要: 生成物は手編集しない。`packages/agent/proto/**`、`packages/agent/src/generated/rpc/**`、`packages/client/src/generated/agent-rpc/**` は command-owned
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
- Agent foundation: `packages/agent/package.json`, `packages/agent/wrangler.toml`, `packages/agent/src/index.ts`, `packages/agent/src/AIAgent.ts`, `packages/agent/src/rpc/**`, `packages/agent/src/storage/schema.ts`
- Agent TypeSpec / proto / RPC codegen: `packages/agent/src/typespec/main.tsp`, `packages/agent/src/typespec/tspconfig.yaml`, `packages/agent/buf.yaml`, `packages/agent/buf.gen.yaml`, `scripts/codegen/check-agent-codegen-drift.mjs`
- Client foundation: `packages/client/package.json`, `packages/client/wrangler.toml`, `packages/client/next.config.ts`, `packages/client/open-next.config.ts`, `packages/client/app/**`, `packages/client/src/server/**`
- Governance: `scripts/governance/verify-agent-surface.mjs`, `scripts/governance/verify-package-boundaries.mjs`, `scripts/security/verify-pnpm-supply-chain.mjs`, `scripts/openspec/verify-scenario-coverage.mjs`
- Removed demo package graph: old demo contract/server/UI packages are no longer active implementation sources
- OpenSpec: `scripts/openspec/verify-scenario-coverage.mjs`

### 2) Classify the change before editing

- Agent contract / codegen: `packages/agent/src/typespec/**`, `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, `packages/client/src/generated/agent-rpc/**`, `scripts/codegen/**`
- Agent runtime: `packages/agent/src/**`, excluding generated RPC output
- Management Client: `packages/client/app/**`, `packages/client/src/server/**`, `packages/client/src/tests/**`, excluding generated Agent RPC output
- Workspace governance: `scripts/governance/**`, `scripts/security/**`, `scripts/openspec/**`, `.opencode/**`
- Tooling / workflow: root config, scripts, hooks, CI, `.opencode/**`

固定の依存方向:

- Agent: Worker entrypoint -> RPC adapter/router/interceptors -> service modules -> Agent domain/runtime modules -> Agent-owned storage/observability/types
- Client: App Router/browser-visible modules -> Server Components/Server Actions -> server-only modules -> Client D1 repositories / generated Agent RPC client
- Agent/Client foundation: `packages/agent/src` must not import `packages/client/src`; `packages/client/src` may import generated Agent RPC code from `packages/client/src/generated/agent-rpc/**` and Connect runtime packages, but must not import `packages/agent/src/**`
- Agent codegen direction: `packages/agent/src/typespec -> packages/agent/proto -> packages/agent/src/generated/rpc` and `packages/client/src/generated/agent-rpc`

### 3) Implement without breaking enforced rules

- Agent contract を変えるときは `packages/agent/src/typespec/**` を直し、`pnpm gen:agent:proto`、`pnpm gen:agent:rpc`、`pnpm check:codegen` で整合を取る。`packages/agent/proto/**` と `packages/**/src/generated/**` は手で直さない
- Agent public API は Protobuf RPC-only。Agent REST resource route、Agent OpenAPI artifact、Orval-generated Agent client、ad-hoc JSON DTO API、public Durable Object fetch API、browser-direct Agent RPC を追加しない
- Agent Connect Worker は binary Protobuf unary profile を守る。production path では JSON encoding と HTTP GET を許可しない
- Every public Agent RPC request body keeps `agent_id`; command requests keep `idempotency_key`; Event publish requests keep non-empty NFC-normalized `thread_key` of at most 512 UTF-8 bytes
- `packages/agent/wrangler.toml` は `AI_AGENT` Durable Object binding と Agent-owned blob storage を持ち、D1、`CLIENT_DB`、Cloudflare Queues producer/consumer bindings を持たない
- `packages/client/wrangler.toml` は `CLIENT_DB` と credential secret references を持ち、`AI_AGENT` と Agent-owned storage bindings を持たない
- Client は `/api/client/*`、`/api/agent*`、Agent REST proxy、arbitrary RPC forwarding route を追加しない。Server Actions / Server Components は UI 内部境界として扱う
- `packages/client` は Agent domain snapshots を Client D1 に保存しない。Client D1 は managed Agent records と credential references だけを所有する
- `.opencode` guidance を更新するときは `packages/agent/**` と `packages/client/**` を implementation/review scope として認識させ、generated RPC output の hand edit permission を追加しない
- Do not use the old demo package graph as an architecture or implementation source
- `packages/**/src/**/*.{ts,tsx}` の export は、生成物とテストを除き TSDoc を付ける
- OpenSpec を触るときは `openspec/specs/**/spec.md` の Scenario ID とテストタイトルの参照を崩さない

### 4) Verify with the real repo flow

変更内容に応じて、少なくとも次を実行する。

- Agent contract / generated 変更: `pnpm gen:agent:proto` -> `pnpm gen:agent:rpc` -> `pnpm check:codegen`
- Agent/Client foundation 変更: relevant package checks/tests plus `pnpm lint`
- Governance 変更: relevant script tests plus `pnpm lint`
- JS / TS / TSX 変更: `pnpm lint` -> `pnpm test:run`
- Client-focused 変更: `pnpm test:management-client`
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
