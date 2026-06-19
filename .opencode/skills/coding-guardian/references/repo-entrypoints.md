# Repository entrypoints

Read these files before applying `coding-guardian` in this repository.

## Core flow

- `AGENTS.md`: project workflow, required commands, language policy
- `CODING_STANDARDS.md`: mechanically enforced rules summary
- `CONTRIBUTING.md`: contributor workflow and required checks
- `package.json`: root command graph for dev, build, lint, check, codegen, and tests
- `.github/workflows/ci.yml`: default CI order

## Git hooks

- `.husky/pre-commit`: `pnpm lint-staged` then `pnpm check:codegen`
- `.husky/commit-msg`: `pnpm commitlint --edit $1`
- `.lintstagedrc.json`: staged-file formatting rules for TS, TSX, JS, JSX, JSON, and Markdown
- `commitlint.config.js`: conventional commit type policy

## Frontend enforcement

- `eslint.config.js`: frontend boundaries for `app` / `domain` / `ui`, direct API import bans, direct fetch bans, TSDoc rules, and hook structure rules
- `packages/frontend/app/package.json`: Vite React app scripts
- `packages/frontend/domain/package.json`: domain hook package boundary
- `packages/frontend/ui/package.json`: MUI-based shared UI package
- `packages/frontend/ui/src/theme.ts`: visual system baseline used by the current app

## Contract enforcement

- `packages/typespec/package.json`: TypeSpec format, compile, and check commands
- `packages/typespec/tspconfig.yaml`: OpenAPI emitter output path
- `packages/typespec/README.md`: API contract package layout and outputs
- `packages/frontend/api/orval.config.ts`: generated SDK input and output path
- `packages/typespec/main.tsp`: API contract source of truth

## Backend enforcement

- `packages/backend/entry/package.json`: Workers entry scripts
- `packages/backend/app/package.json`: app-layer package metadata
- `packages/backend/http/package.json`: HTTP adapter package metadata
- `packages/backend/persistence/package.json`: persistence package metadata
- `packages/backend/usecases/package.json`: usecase package metadata
- `packages/backend/domain/package.json`: domain package metadata
- `packages/backend/types/package.json`: backend shared types package metadata
- `packages/backend/drizzle/package.json`: Drizzle schema package metadata
- `packages/backend/http/src/contracts/openapi-contract.test.ts`: server OpenAPI must match TypeSpec-generated OpenAPI

## OpenSpec enforcement

- `scripts/openspec/verify-scenario-coverage.mjs`: Scenario ID coverage checks used by `pnpm lint`

## Important reality checks

- There is no `packages/frontend/web`
- There is no `packages/backend/internal`
- There is no Go backend in this repository
- There is no `openapi.gen.go`
- There is no `docs/brand/**` baseline today
