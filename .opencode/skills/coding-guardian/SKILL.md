---
name: coding-guardian
description: Enforce this repository's real React, Hono, Drizzle, and TypeSpec rules while editing code, docs, or tooling.
---

# Coding Guardian

この skill は、このリポジトリで実際に fail する規約と検証フローから外れないようにガードします。

- 返答言語: `AGENTS.md` に従う
- 重要: まず `CODING_STANDARDS.md` と enforcement entrypoint を読む
- 重要: API 契約の正は `packages/typespec/main.tsp`
- 重要: 生成物は手編集しない
- 重要: frontend は React + TSX + Vite + React Router であり、`packages/frontend/web` や SvelteKit 前提を持ち込まない
- 重要: backend は TypeScript + Hono + Cloudflare Workers + Drizzle であり、Go / Gin / GORM 前提を持ち込まない
- 重要: `pnpm lint` には OpenSpec validate と Scenario coverage check が含まれる

## Workflow

### 1) Load the repository rules before editing

最初に次を読む。

- `AGENTS.md`
- `CODING_STANDARDS.md`
- `CONTRIBUTING.md`
- `.opencode/skills/coding-guardian/references/repo-entrypoints.md`

特に重要な enforcement entrypoint:

- root flow: `package.json`, `.github/workflows/ci.yml`, `.husky/pre-commit`, `.husky/commit-msg`, `.lintstagedrc.json`, `commitlint.config.js`, `eslint.config.js`
- TypeSpec / codegen: `packages/typespec/package.json`, `packages/typespec/tspconfig.yaml`, `packages/typespec/README.md`, `packages/frontend/api/orval.config.ts`
- frontend: `packages/frontend/app/package.json`, `packages/frontend/domain/package.json`, `packages/frontend/ui/package.json`
- backend: `packages/backend/entry/package.json`, `packages/backend/app/package.json`, `packages/backend/http/package.json`, `packages/backend/persistence/package.json`, `packages/backend/usecases/package.json`, `packages/backend/domain/package.json`, `packages/backend/types/package.json`, `packages/backend/drizzle/package.json`, `packages/backend/http/src/contracts/openapi-contract.test.ts`
- OpenSpec: `scripts/openspec/verify-scenario-coverage.mjs`

### 2) Classify the change before editing

- Contract / codegen: `packages/typespec/**`, `packages/frontend/api/**`
- Frontend: `packages/frontend/app/**`, `packages/frontend/domain/**`, `packages/frontend/ui/**`
- Backend: `packages/backend/**`
- Tooling / workflow: root config, scripts, hooks, CI, `.opencode/**`

固定の依存方向:

- Client: `packages/frontend/app -> packages/frontend/domain -> packages/frontend/api` and `packages/frontend/app -> packages/frontend/ui`
- Server: `packages/backend/entry -> packages/backend/app -> (packages/backend/http | packages/backend/persistence | packages/backend/usecases) -> packages/backend/domain -> packages/backend/types`
- Persistence schema: `packages/backend/persistence -> packages/backend/drizzle`

### 3) Implement without breaking enforced rules

- Contract を変えるときは `packages/typespec/main.tsp` を直し、`pnpm gen:api-sdk` と `pnpm check:codegen` で整合を取る
- `packages/typespec/openapi/openapi.json` と `packages/frontend/api/src/generated/client.ts` は手で直さない
- Frontend app / domain で `fetch`, `globalThis.fetch`, `axios`, `cross-fetch` を直接使わない
- Frontend app の pages / components から `@cfreact-template-frontend/api` を直 import しない。domain hook を経由する
- React と TSX はこの repo の正規 frontend 実装であり、Svelte 用の制約へ読み替えない
- `packages/frontend/domain/src/hooks/**` では `use*` export、`{ data, actions }` 戻り値、`*Data` / `*Actions` 型注釈を守る
- 再利用したい見た目は `@cfreact-template-frontend/ui` に寄せ、画面固有の構成だけを `packages/frontend/app` に置く
- Backend HTTP は `packages/backend/http`、配線は `packages/backend/app`、永続化は `packages/backend/persistence` / `packages/backend/drizzle` に置く
- `packages/backend/http` から `packages/backend/persistence` を直 import しない。`c.env` も HTTP 層で直接読まない
- `packages/backend/domain` と `packages/backend/usecases` では adapter import や framework 依存を持ち込まない
- `packages/**/src/**/*.{ts,tsx}` の export は、生成物とテストを除き TSDoc を付ける
- OpenSpec を触るときは `openspec/specs/**/spec.md` の Scenario ID とテストタイトルの参照を崩さない

### 4) Verify with the real repo flow

変更内容に応じて、少なくとも次を実行する。

- Contract / generated 変更: `pnpm gen:api-sdk` -> `pnpm check:codegen`
- TypeSpec 変更: `pnpm format:check` -> `pnpm check`
- JS / TS / TSX 変更: `pnpm lint` -> `pnpm test:run`
- Frontend-focused 変更: `pnpm test:client`
- Backend-focused 変更: `pnpm test:server`
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
- `packages/frontend/app` から `@cfreact-template-frontend/api` の直 import
- frontend app / domain での `fetch` / `axios` / `cross-fetch`
- hooks が `{ data, actions }` を返さない
- export に必要な TSDoc がない
- `packages/backend/http` から `packages/backend/persistence` の直 import
- HTTP 層での `c.env` 直接参照
- OpenSpec の Scenario ID とテスト参照の不整合
