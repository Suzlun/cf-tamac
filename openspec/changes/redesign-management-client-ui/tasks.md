## 1. OpenSpec and UI Contract Inputs

- [ ] 1.1 Read `proposal.md`, `design.md`, `specs/management-client-shell/spec.md`, `specs/agent-management-ui/spec.md`, and `wireframes/*.md`; pin `/` → `/agents`, `/settings`, Agents-screen registration, selected-Agent left sidebar, and Agent-scoped Tool/Compaction detail placement as implementation decisions.
- [ ] 1.2 Confirm the implementation branch does not edit `packages/agent/src/typespec/**`, `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, or `packages/client/src/generated/agent-rpc/**`; keep Agent API impact at zero for this change.

## 2. Route Shell and Navigation

- [ ] 2.1 Update `packages/client/app/page.tsx` so `/` redirects to `/agents`; verify the root entry opens the Agent registry flow.
- [ ] 2.2 Update `packages/client/app/layout.tsx` and add `packages/client/src/components/management-shell.tsx` with Topbar, skip link, left sidebar slot, and `<main id="main-content">`.
- [ ] 2.3 Add `packages/client/src/components/sidebar-navigation.tsx` with Global area (`Agents`, `Global Settings`) and selected-Agent area (`Overview`, `Threads`, `Events`, `Runs`, `Schedules`, `Integrations`, `Settings`) plus Agent-unselected guidance state.
- [ ] 2.4 Add `packages/client/app/agents/[agentId]/layout.tsx` to resolve registered Agent metadata server-side and provide selected-Agent navigation without exposing credentials to Browser props.
- [ ] 2.5 Delete `packages/client/src/components/section-nav.tsx` and remove `ControlRoomFrame` horizontal navigation usage from route shells; keep or shrink `control-room-frame.tsx` only if it remains a non-navigation shared layout helper.
- [ ] 2.6 Add `packages/client/app/settings/page.tsx` for Global Settings using browser-safe Client-wide runtime/config/status and display preference content only.

## 3. Agents Screen and Registration Flow

- [ ] 3.1 Update `packages/client/app/agents/page.tsx` to render card/summary-first Agent registry, search/filter empty state, pinned grouping, credential status hints, and Agent selection action.
- [ ] 3.2 Add `packages/client/src/components/agent-card.tsx` and update `packages/client/src/components/agent-list.tsx` so Agent status uses label + icon + visual tone, not color alone.
- [ ] 3.3 Move the Agent registration flow from `packages/client/app/agents/new/page.tsx` into `/agents` as an in-page panel/dialog backed by Server Actions.
- [ ] 3.4 Remove separate Agent registration route code while keeping the registration flow available from the `Agents` screen action.
- [ ] 3.5 Update `packages/client/src/server/actions/managed-agents.ts` to provide `selectManagedAgent` and reuse existing last-opened/pin/registration logic without duplicating Client D1 repository behavior.

## 4. Selected-Agent Screens and Metadata Placement

- [ ] 4.1 Update `packages/client/app/agents/[agentId]/page.tsx` Overview to use card/summary-first layout with lifecycle/config/credential/model-policy summaries, approval queue, recent activity, and Compaction summary.
- [ ] 4.2 Update `packages/client/app/agents/[agentId]/threads/page.tsx` so Thread detail includes Memory/Compaction metadata in the Thread context.
- [ ] 4.3 Update `packages/client/app/agents/[agentId]/events/page.tsx` so Events render as timeline/cards with causality links and ToolInvocation-derived event metadata.
- [ ] 4.4 Update `packages/client/app/agents/[agentId]/runs/page.tsx` so Runs detail contains Tool execution and Tool approval sections.
- [ ] 4.5 Update `packages/client/app/agents/[agentId]/schedules/page.tsx` to render Schedule cards, create/cancel states, overlap policy, and secret-safe errors.
- [ ] 4.6 Update `packages/client/app/agents/[agentId]/integrations/page.tsx` so Integration detail contains Tool catalog and setup/cleanup status.
- [ ] 4.7 Update `packages/client/app/agents/[agentId]/settings/page.tsx` so Agent API, credential, model policy, and settings sections remain Agent-scoped and secret-safe.
- [ ] 4.8 Delete `packages/client/app/agents/[agentId]/tools/page.tsx` and integrate reusable Tool UI through Runs, Events, Integrations, Overview, or Settings.
- [ ] 4.9 Delete `packages/client/app/agents/[agentId]/compactions/page.tsx` and integrate reusable Compaction UI through Overview or Threads detail.
- [ ] 4.10 Update `packages/client/src/components/tool-view.tsx` and `packages/client/src/components/compaction-view.tsx` so they render from explicit Agent-scoped detail context props.

## 5. Browser Boundary, Client D1 Boundary, and Shared States

- [ ] 5.1 Audit new shell, sidebar, card, registration, and Agent-scoped components for forbidden browser-visible imports: generated Agent RPC, Connect runtime, server-only Agent RPC factories, `CLIENT_DB`, credential refs, `Authorization`, and `Bearer`.
- [ ] 5.2 Keep Agent RPC calls inside Server Components, Server Actions, or `packages/client/src/server/agent-rpc/**`; verify every file under that server-only RPC directory still begins with `import 'server-only';`.
- [ ] 5.3 Keep Client D1 writes limited to managed Agent records and credential references; verify no Agent-domain snapshot table, repository write, or cached Agent-domain state is added.
- [ ] 5.4 Implement loading, empty, error, permission-denied, disabled, pending, filter-empty, and selected-agent-required states using `wireframes/11-states-copy-a11y.md` copy guidance.
- [ ] 5.5 Add or update shared accessible state components for skip link, focus-visible behavior, `aria-current`, disabled reason labels/tooltips, dialog focus trap, and `prefers-reduced-motion`.

## 6. Scenario-Covered Automated Tests

- [ ] 6.1 Add/update `packages/client/src/tests/management-navigation.test.tsx` with a test titled `[MANAGEMENT-CLIENT-SHELL-S001] Agent registry shell renders for a browser user` covering `/agents`, registration action, and selected-Agent guidance state.
- [ ] 6.2 Add/update `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts` with a test titled `[MANAGEMENT-CLIENT-SHELL-S002] Browser bundles do not call Agent RPC directly` covering the redesigned shell and card components.
- [ ] 6.3 Add/update `packages/client/src/tests/management-navigation.test.tsx` with a test titled `[MANAGEMENT-CLIENT-SHELL-S009] Left sidebar separates global and selected-Agent navigation` covering Global area and Agent-unselected state.
- [ ] 6.4 Add/update `packages/client/src/tests/management-navigation.test.tsx` with a test titled `[MANAGEMENT-CLIENT-SHELL-S010] Selected-Agent area activates for registered Agent context` covering the seven selected-Agent items and Topbar selected-Agent display.
- [ ] 6.5 Add/update `packages/client/src/tests/client-api-proxy-absence.test.ts` with a test titled `[MANAGEMENT-CLIENT-SHELL-S008] Client exposes no Agent API proxy routes` covering the public Agent API proxy security boundary.
- [ ] 6.6 Add/update `packages/client/src/tests/management-navigation.test.tsx` with a test titled `[MANAGEMENT-CLIENT-SHELL-S001] Root entry opens the Agent registry shell` covering `/` redirect behavior and Agent registry guidance.
- [ ] 6.7 Add/update `packages/client/src/tests/agent-registry-shell.test.tsx` or `management-navigation.test.tsx` with a test titled `[AGENT-MANAGEMENT-UI-S001] Agent list が registry 表示と並び順を支援する` covering card-first pinned ordering and last-opened update.
- [ ] 6.8 Add/update `packages/client/src/tests/agent-registry-shell.test.tsx` with a test titled `[AGENT-MANAGEMENT-UI-S002] Add Agent フォームが connection メタデータをアクセシブルに検証する` covering in-page registration validation and accessible error linkage.
- [ ] 6.9 Add/update `packages/client/src/tests/agent-registry-shell.test.tsx` with a test titled `[AGENT-MANAGEMENT-UI-S010] Agents screen owns Agent registration and selection` covering registration action, selection action, and status labels.
- [ ] 6.10 Add/update `packages/client/src/tests/management-navigation.test.tsx` with a test titled `[AGENT-MANAGEMENT-UI-S011] Selected-Agent screens activate only for selected Agent` covering Agent-scoped routes and selected-agent-required state.
- [ ] 6.11 Add/update `packages/client/src/tests/management-navigation.test.tsx` or dedicated component tests with a test titled `[AGENT-MANAGEMENT-UI-S012] Tools and Compactions are shown inside Agent-scoped context` covering Tool/Compaction metadata in Overview/Threads/Runs/Integrations/Settings.
- [ ] 6.12 Add/update `packages/client/src/tests/management-navigation.test.tsx` with a test titled `[AGENT-MANAGEMENT-UI-S013] Global Settings handles only Client-wide settings` covering `/settings` content and absence of Agent-specific data.
- [ ] 6.13 Add/update `packages/client/src/tests/client-d1-schema.test.ts` and `client-repository-boundary.test.ts` with tests titled `[AGENT-MANAGEMENT-UI-S013] Client D1 remains limited to management metadata` covering no Agent-domain snapshot table or repository write.
- [ ] 6.14 Add/update component tests with a test titled `[AGENT-MANAGEMENT-UI-S014] Screens expose actionable states without leaking secrets` covering loading/empty/error/disabled/pending states and secret-safe copy.
- [ ] 6.15 Add/update `packages/client/src/tests/client-repository-boundary.test.ts` with a test titled `[AGENT-MANAGEMENT-UI-S005] Thread Event Run と Compaction views が Agent-owned history を表示する` covering server-side Agent RPC reads and no Client D1 persistence for Agent-owned history.

## 7. Verification and Review

- [ ] 7.1 Run `openspec validate --type change "redesign-management-client-ui" --strict --no-interactive` after updating artifacts and before implementation review.
- [ ] 7.2 Run `pnpm lint` and fix OpenSpec, ESLint, governance, scenario coverage, and supply-chain failures without bypassing lint.
- [ ] 7.3 Run `pnpm check:client` and fix type/boundary issues in `packages/client`.
- [ ] 7.4 Run `pnpm test:client` and confirm every new/updated automated test title contains the bracketed Scenario ID it covers.
- [ ] 7.5 Run `pnpm build` to verify the Management Client build and browser bundle boundary.
- [ ] 7.6 Run `pnpm check:codegen` to prove Agent proto/RPC generated outputs have no drift.
- [ ] 7.7 Request `unit/client/designer` review for UI fidelity against `wireframes/*.md`, then request `unit/client/reviewer` approval with touched paths, Scenario ID tests, and command results.
