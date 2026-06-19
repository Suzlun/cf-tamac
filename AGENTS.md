## Primary Rules

- Think in English; respond in Japanese.

## Commands

- Install: `corepack enable && pnpm install`
- Dev (all): `pnpm dev:all`
- Dev (server): `pnpm dev:server` (Wrangler on `http://localhost:8787`)
- Dev (client): `pnpm dev:client` (Vite on `http://localhost:5173`)

## API Contract (TypeSpec)

- Source of truth: `packages/typespec/main.tsp`
- Generated OpenAPI: `packages/typespec/openapi/openapi.json`
- Regenerate OpenAPI + client SDK: `pnpm gen:api-sdk`
- Codegen drift check (CI-style): `pnpm check:codegen`

## Testing

- All unit tests: `pnpm test:run`
- Server tests: `pnpm test:server`
- Client tests: `pnpm test:client`
- E2E: `pnpm test:e2e`

## Supply Chain

- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 4320` (72 hours); do not lower or bypass it.
- Dependency additions/updates must land at least 72 hours before release, unless an explicitly reviewed emergency exception is approved.
- New dependency build scripts require package-by-package approval through `allowBuilds`; never enable `dangerouslyAllowAllBuilds`.

## Architecture Notes

- Client dependency direction: `frontend/app -> frontend/domain -> frontend/api`
- Server dependency direction: `backend/entry -> backend/app -> (backend/http|backend/persistence|backend/usecases) -> backend/domain -> backend/types`
- API contract direction: implementation must follow TypeSpec; do not generate OpenAPI from server routes for SDK input.

## OpenSpec (Spec -> Test Contract)

- Source of truth (current behavior): `openspec/specs/**/spec.md`
- Every `#### Scenario:` heading MUST end with a stable Scenario ID: `(...-S001)`
  - Example: `#### Scenario: Create a user (USER-MGMT-S001)`
- Automated tests MUST reference Scenario IDs in the test title using brackets:
  - Example: `it('[USER-MGMT-S001] Create a user', async () => { ... })`
- To explicitly opt out of automation for a scenario, add `Tags: manual` under the scenario heading
- Guardrails are enforced by `pnpm lint`:
  - `openspec validate --all --strict`
  - Scenario ID coverage check (`scripts/openspec/verify-scenario-coverage.mjs`)
  - Coverage check uses `openspec/specs/**` as the contract (sync/archive deltas if you are working in `openspec/changes/**`)
