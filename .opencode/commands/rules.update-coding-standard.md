---
description: Update `CODING_STANDARDS.md` from this repo's actual Agent/Client foundation lint, CI, git-hook, TypeSpec-to-proto, and test rules with beginner-friendly examples.
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
6. Use this repo's actual Agent TypeSpec-to-proto setup precisely:
   - Agent API source of truth is `packages/agent/src/typespec/main.tsp`
   - Generated outputs are `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, and `packages/client/src/generated/agent-rpc/**`
   - Do not model Agent APIs with OpenAPI or Orval
7. Mention OpenSpec exactly as implemented today through `pnpm lint:openspec` and `scripts/openspec/verify-scenario-coverage.mjs`.
8. Use this repo's real file names and paths. Do not make old demo package categories the primary architecture or command model.

## Required Structure

`CODING_STANDARDS.md` MUST contain these headings in order:

## 0. 全体方針

## 1. Agent API 契約と生成

## 2. Agent/Client package boundaries

## 3. Management Client server/browser boundary

## 4. Agent layer direction

## 5. Legacy demo deletion notes

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
   - `packages/agent/src/typespec/main.tsp`
   - `packages/agent/src/typespec/tspconfig.yaml`
   - `packages/agent/buf.yaml`
   - `packages/agent/buf.gen.yaml`
   - `scripts/codegen/check-agent-codegen-drift.mjs`
   - `scripts/governance/verify-agent-surface.mjs`
   - `scripts/governance/verify-package-boundaries.mjs`
   - `scripts/openspec/verify-scenario-coverage.mjs`
3. Extract only rules that actually fail in this repo, including repo-specific ones such as:
   - Agent TypeSpec is the source of truth; generated proto/RPC outputs are not hand-edited; codegen drift fails.
   - Agent boundaries: Protobuf RPC-only, no REST/OpenAPI/Orval/ad-hoc JSON/public Durable Object fetch, Worker -> RPC -> service -> runtime -> storage direction.
   - Client boundaries: Next.js App Router/browser-visible modules do not import server-only Agent RPC, credentials, generated RPC construction, or Connect runtime.
   - Workspace governance: Agent/Client runtime coupling, binding separation, OpenSpec Scenario ID coverage, and supply-chain policy are enforced.
   - Exact CI step order and exact git hook behavior.
4. Update `CODING_STANDARDS.md` following the constraints above.
5. Before finishing, sanity-check that every cited rule maps to a real failing command, test, or hook in this repo and that every referenced file path exists.

## Notes

- This command is the canonical way to update `CODING_STANDARDS.md`
- Mention `opencode run --command rules.update-coding-standard` in the document
- Prefer concise explanations over config dumps
