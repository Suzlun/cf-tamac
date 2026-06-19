---
description: Update `CODING_STANDARDS.md` from this repo's actual lint, CI, git-hook, TypeSpec, and test rules with beginner-friendly examples.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding.

## Goal

Update `CODING_STANDARDS.md` so contributors can understand the enforced rules of this repository at a glance, without reading configs first.

This document is lint-as-rules. Include only rules that are mechanically enforceable by the repo's lint commands, CI, tests in the standard flow, or git hooks.

## Hard Constraints

1. Source of truth is the actual enforcement files in this repo. If prose docs disagree with config, scripts, or tests, config, scripts, and tests win.
2. The target file is `CODING_STANDARDS.md`.
3. Do not invent rule IDs.
4. For each enforced rule, include:
   - 1-line summary
   - Enforcement point with command and literal file path
   - `NG例` and `OK例`
5. Include a `Git hooks` section that describes the exact current behavior:
   - `pre-commit`: `pnpm lint-staged` then `pnpm check:codegen`
   - `commit-msg`: `pnpm commitlint --edit $1`
   - Break down what `.lintstagedrc.json` actually runs for TS, TSX, JS, JSX, JSON, and Markdown
6. Use this repo's actual TypeSpec setup precisely:
   - `packages/typespec/package.json` defines `format`, `format:check`, `gen:openapi`, and `check`
   - OpenAPI output is configured by `packages/typespec/tspconfig.yaml`
7. Mention OpenSpec exactly as implemented today through `pnpm lint:openspec` and `scripts/openspec/verify-scenario-coverage.mjs`.
8. Use this repo's real file names and paths. Do not reference non-existent legacy paths such as `packages/frontend/web`, `packages/backend/internal/**`, `packages/backend/.golangci.yml`, `tools/scripts/*`, root `.spectral.yaml`, or `commitlint.config.cjs`.

## Required Structure

`CODING_STANDARDS.md` MUST contain these headings in order:

## 0. 全体方針

## 1. 契約と生成

## 2. TypeSpec / OpenAPI

## 3. フロントエンド

## 4. バックエンド構造と依存

## 5. バックエンドの API / 認証 / 永続化

## 6. CI 必須ステップ

## 7. Git hooks

## 8. OpenSpec

## 9. 設定参照

If a section has no enforceable rules beyond a short scope note, keep it brief.

## Execution Steps

1. Read repo context docs:
   - `AGENTS.md`
   - `README.md`
   - `CONTRIBUTING.md`
   - `CODING_STANDARDS.md`
2. Read the actual enforcement entrypoints:
   - `package.json`
   - `.github/workflows/ci.yml`
   - `.husky/pre-commit`
   - `.husky/commit-msg`
   - `.lintstagedrc.json`
   - `commitlint.config.js`
   - `eslint.config.js`
   - `packages/typespec/package.json`
   - `packages/typespec/tspconfig.yaml`
   - `packages/typespec/README.md`
   - `packages/frontend/api/orval.config.ts`
   - `packages/backend/http/src/contracts/openapi-contract.test.ts`
   - `scripts/openspec/verify-scenario-coverage.mjs`
3. Extract only rules that actually fail in this repo, including repo-specific ones such as:
   - TypeSpec is the source of truth; generated OpenAPI and frontend SDK are not hand-edited; codegen drift fails.
   - Frontend boundaries such as `app -> domain -> api`, no direct API import from app, no direct `fetch` or `axios`, exported declarations require TSDoc, and hooks must return `{ data, actions }`.
   - Backend guardrails such as layer boundaries across `entry/app/http/persistence/usecases/domain/types`, no HTTP-to-persistence direct import, and no direct `c.env` access in HTTP.
   - Hono OpenAPI output must match the TypeSpec-generated OpenAPI contract.
   - Exact CI step order and exact git hook behavior.
4. Update `CODING_STANDARDS.md` following the constraints above.
5. Before finishing, sanity-check that every cited rule maps to a real failing command, test, or hook in this repo and that every referenced file path exists.

## Notes

- This command is the canonical way to update `CODING_STANDARDS.md`
- Mention `opencode run --command rules.update-coding-standard` in the document
- Prefer concise explanations over config dumps
