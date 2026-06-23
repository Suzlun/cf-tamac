# Client Management UI Wireframe / Specification

- Change: `implement-agent-service-base`
- Owner: `unit/client/designer`
- Implementation target: `packages/client/app/agents/**` + `packages/client/src/server/actions/**` (owned by `unit/client/engineer`)
- Status: Design-only evidence. No code, generated files, or `tasks.md` checkboxes were modified.
- Stack baseline: `openspec/changes/implement-agent-service-base/mandatory-stack-applicability.md` is the source of truth for the mandatory stack (Next.js App Router 16.2.9, React 19.2.7, React Compiler, TanStack Query 5.101.0, Drizzle ORM for Client D1, shadcn/ui ecosystem, no Vite, no React Router, no Prisma). This wireframe specifies the UI-level mapping and boundaries that consume that stack.
- Revision: v3 — replaces the former Prisma repository direction with mandatory Drizzle ORM, while preserving the shadcn/ui + Radix + Tailwind mapping, TanStack Query browser-safe cache boundaries, React Compiler compatibility notes, route shells, copy, state coverage, accessibility, and secrecy invariants.
- Related tasks: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8 (Stage 8 Client Management UI)
- Related Scenario IDs: `[CLIENT-MANAGEMENT-S001]` … `[CLIENT-MANAGEMENT-S009]`, `[CLIENT-REGISTRY-S001]` … `[CLIENT-REGISTRY-S005]`

## 1. Intent and Target Users

### Intent

Convert the `client-management` and `client-registry` spec requirements into an implementation-ready UI specification so that `unit/client/engineer` can build the Stage 8 management UI (tasks 11.1-11.8) without inventing layout, copy, state, or accessibility decisions.

This artifact is supplemental to `design.md` (which currently states `UI Wireframes: N/A — wireframe not yet generated`). It does not change proposal, spec, or task scope.

### Target users

| Persona             | Role in UI                                                                                                            | Permissions                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Operator (管理者)   | Registers Agents, inspects Threads/Runs/Memory, approves Tools, installs/uninstalls Integrations, rotates credentials | Full management scope, surfaced as `acting_user_id` in Client Service JWT |
| Auditor (read-only) | Reads Agent overview, Thread/Event/Run/Compaction history, Integration state                                          | Read scope only; mutation controls render disabled with reason copy       |

Browser users are never treated as Agent principals. The Client server attaches `acting_user_id` and scopes to the short-lived Client Service JWT before calling Agent RPC (see `packages/client/src/server/agent-rpc/authentication.ts`).

## 2. Invariants and Browser Secrecy Boundaries

These invariants are non-negotiable and apply to every section below. They are restated from `client-management/spec.md` and `client-registry/spec.md` so the engineer has a single source of truth while implementing.

1. **No browser Agent credentials.** HTML, JS bundles, `localStorage`, `sessionStorage`, and network responses must never contain Agent credential secrets, private keys, raw JWT signing material, or Provider secrets. `[CLIENT-MANAGEMENT-S009]`, `[CLIENT-REGISTRY-S002]`.
2. **No direct Agent RPC from browser.** Browser code must never call the Agent RPC origin or construct raw Agent RPC requests. All Agent domain data is fetched server-side via Server Components / Server Actions using the generated Connect client. `[CLIENT-REGISTRY-S003]`, `[CLIENT-MANAGEMENT-S009]`.
3. **No public Agent proxy route.** No `/api/client/agents`, `/api/client/integrations`, or any REST/JSON/RPC proxy route that mirrors Agent Service operations. Server Actions and Server Components are UI-internal execution boundaries, not public Agent APIs. `[CLIENT-REGISTRY-S005]`.
4. **No Agent domain snapshots in Client D1.** Client D1 holds only `client_managed_agents` and `client_agent_credential_refs`. Thread, Event, Run, Compaction, Memory, Schedule, ToolInvocation, Installation, AdapterConnection, DeliveryContext are always fetched live from Agent RPC. `[CLIENT-REGISTRY-S004]`.
5. **Browser-safe serialization only.** Server Action return types (e.g. `BrowserSafeAgentOverview`, `BrowserSafeAgentCredential`, `BrowserSafeCredentialReference`) must strip `credentialRef`, `publicFingerprint`, secret reference, and verifier material before crossing the server/browser boundary. `[CLIENT-REGISTRY-S002]`.
6. **Acting user context on every mutation.** Config update, credential rotation, Schedule create/cancel, Tool approve/reject, Integration install/uninstall must pass `ActingUserContext` to the Agent RPC client. `[CLIENT-MANAGEMENT-S004]`, `[CLIENT-MANAGEMENT-S006]`, `[CLIENT-MANAGEMENT-S007]`, `[CLIENT-MANAGEMENT-S008]`.
7. **Safe error messages.** Agent RPC errors map to user-facing messages via the Connect error taxonomy. Never expose raw internal stack traces, secret metadata, or Provider private material in error copy. `[CLIENT-MANAGEMENT-S003]`.

## 3. Route Map

All routes live under `packages/client/app/agents/**`. The existing shell files (`page.tsx`, `management-content.tsx`) are placeholders to be replaced/extended by the engineer; they are not the final UI.

| Route                            | Task | Primary Scenario IDs                                                           | Server Action(s) consumed                                                                 | Layout                               |
| -------------------------------- | ---- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| `/agents`                        | 11.1 | `[CLIENT-MANAGEMENT-S001]`, `[CLIENT-REGISTRY-S001]`                           | `listManagedAgents` (registry repo), `markManagedAgentOpened`                             | Agent list                           |
| `/agents/new`                    | 11.2 | `[CLIENT-MANAGEMENT-S002]`, `[CLIENT-REGISTRY-S001]`, `[CLIENT-REGISTRY-S002]` | `registerManagedAgent`, `saveCredentialReference`                                         | Add-Agent form                       |
| `/agents/[agentId]`              | 11.3 | `[CLIENT-MANAGEMENT-S003]`, `[CLIENT-REGISTRY-S004]`                           | `getAgentOverview`, `getAgentState`                                                       | Agent overview                       |
| `/agents/[agentId]/settings`     | 11.4 | `[CLIENT-MANAGEMENT-S004]`, `[CLIENT-REGISTRY-S002]`                           | `getAgentConfig`, `updateAgentConfig`, `rotateAgentCredential`, `saveCredentialReference` | Settings form                        |
| `/agents/[agentId]/threads`      | 11.5 | `[CLIENT-MANAGEMENT-S005]`, `[CLIENT-REGISTRY-S004]`                           | `listThreads`, `getThread`                                                                | Thread list + detail drawer          |
| `/agents/[agentId]/events`       | 11.5 | `[CLIENT-MANAGEMENT-S005]`                                                     | `listEvents`                                                                              | Event list                           |
| `/agents/[agentId]/runs`         | 11.5 | `[CLIENT-MANAGEMENT-S005]`                                                     | `listRuns`, `getRun`, `cancelRun`                                                         | Run list + detail                    |
| `/agents/[agentId]/compactions`  | 11.5 | `[CLIENT-MANAGEMENT-S005]`                                                     | `getLatestCompaction`, `getThreadMemory`, `searchThreadHistory`                           | Compaction/Memory/History view       |
| `/agents/[agentId]/schedules`    | 11.6 | `[CLIENT-MANAGEMENT-S006]`                                                     | `listSchedules`, `createSchedule`, `cancelSchedule`                                       | Schedule list + create form          |
| `/agents/[agentId]/tools`        | 11.7 | `[CLIENT-MANAGEMENT-S007]`                                                     | `listTools`, `listInvocations`, `approveInvocation`, `rejectInvocation`                   | Tool catalog + approval queue        |
| `/agents/[agentId]/integrations` | 11.8 | `[CLIENT-MANAGEMENT-S008]`                                                     | `listInstallations`, `installIntegration`, `uninstallIntegration`                         | Integration list + install/uninstall |

Note: `runs`, `compactions` subroutes are not in the current placeholder tree but are required by task 11.5. The engineer must add `app/agents/[agentId]/runs/page.tsx` and `app/agents/[agentId]/compactions/page.tsx`. The existing `threads`, `events`, `schedules`, `tools`, `integrations`, `settings` shells exist and will be replaced.

## 4. Global Layout and Aesthetic Direction

### 4.1 Aesthetic commitment

The existing `globals.css` establishes a **dark "control-room" aesthetic** that must be preserved and extended. Do not introduce a generic SaaS dashboard look.

- **Theme**: Dark, `color-scheme: dark`. Background: layered radial gradients over `#07090c → #101820 → #1b140b`.
- **Palette tokens** (already in `:root`): `--paper` (#efe7d0), `--ink` (#15120d), `--coal` (#0c1014), `--panel` (rgba paper 0.08), `--line` (rgba paper 0.22), `--signal` (#ffb000 amber), `--cyan` (#79e2cf), `--muted` (rgba paper 0.68).
- **Typography**: Display + body in `"Iowan Old Style", "Palatino Linotype", Palatino, serif`. Eyebrows, labels, tokens, and tabular data in `"IBM Plex Mono", "Courier New", monospace` with `letter-spacing: 0.12em` and `text-transform: uppercase`.
- **Container motif**: `.control-room` rounded panel (28px radius, 1px `--line` border, layered paper gradient, deep shadow). `.topline` bar with monospace uppercase breadcrumb + `.signal` amber dot.
- **Signal semantics**: amber `--signal` for active/pending states; cyan `--cyan` for eyebrows and informational accents; `--muted` for secondary copy. Error states introduce a controlled red accent (see §4.4).

### 4.2 App shell

```
<html lang="ja">
  <body>
    <main class="app-shell">          ← clamp padding, min-height 100vh
      <ControlRoomFrame>              ← wraps every route
        <Topline>                     ← breadcrumb + signal
        <SectionNav>                  ← contextual tabs
        <PageBand>                    ← main content
      </ControlRoomFrame>
    </main>
  </body>
</html>
```

`ControlRoomFrame` is the shared chrome. It renders the `.control-room` panel, `.topline` breadcrumb, and a `.section-nav` row. Each route fills the `.page-band` slot.

### 4.3 Desktop layout (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT REGISTRY  ›  AGENT-ID-SLUG          ● signal label            │  topline
├─────────────────────────────────────────────────────────────────────┤
│  Registry  ›  Overview  ›  Threads  ›  Events  ›  Runs  ›            │  section-nav
│  Compactions  ›  Schedules  ›  Tools  ›  Integrations  ›  Settings   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  EYEBROW LABEL                                                        │
│  H2 page heading                                                      │
│  agent_id: <slug>                                                     │
│                                                                       │
│  Lead paragraph (max 46rem)                                           │
│                                                                       │
│  ┌─────────────── page-band content (route-specific) ─────────────┐  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

- `.section-nav` is a horizontal scrollable row of links; the active route gets `aria-current="page"` and an amber underline.
- `.page-band` uses `clamp(1.5rem, 5vw, 5rem)` padding.
- Data tables use a 2-column or 3-column grid depending on density (see per-route specs).

### 4.4 Mobile layout (< 768px)

- `.control-room` radius reduces to 20px; `.page-band` padding reduces to `clamp(1rem, 4vw, 1.5rem)`.
- `.section-nav` becomes a horizontally scrollable strip with `scroll-snap-type: x proximity`; active item snaps into view.
- Data tables collapse to stacked cards: each row becomes a card with label/value pairs in monospace.
- Forms become single-column; submit button sticks to the bottom of the viewport with `position: sticky` on small screens.

### 4.5 State tokens (shared)

| Token class       | Visual                                                           | Use                                      |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `.state-loading`  | Pulsing `--muted` skeleton bars (1.2s ease-in-out infinite)      | Server Component / Server Action pending |
| `.state-empty`    | Centered eyebrow + short copy + single primary action            | Zero records                             |
| `.state-error`    | Red accent `--error` (#d96b6b), inline alert with `role="alert"` | Agent RPC failure, validation failure    |
| `.state-success`  | Cyan `--cyan` checkmark glyph + transient confirmation line      | Mutation accepted                        |
| `.state-disabled` | 50% opacity, `cursor: not-allowed`, `aria-disabled="true"`       | Permission denied, lifecycle blocked     |
| `.state-pending`  | Amber `--signal` dot + monospace "PENDING"                       | Optimistic / in-flight mutation          |

Add `--error: #d96b6b;` to `:root` in `globals.css` (engineer task). Do not introduce additional palette colors.

### 4.6 Design system foundation (shadcn/ui + Tailwind + TanStack Query + Drizzle ORM + React Compiler)

The stack baseline is fixed by `mandatory-stack-applicability.md`. This subsection fixes the UI-level consumption of that stack so the engineer does not invent primitive direction.

**Mandatory primitives**: shadcn/ui (copy-in component registry built on Radix UI + Tailwind CSS) is the single source of UI primitives. The engineer must not hand-roll bespoke `DataTable`, `FormField`, `ConfirmDialog`, `DetailDrawer`, `SignalBadge`, etc. Every bespoke component named in §5 is replaced by a shadcn/ui + Radix composition per the §5 mapping table. shadcn/ui components are vendored under `packages/client/src/components/ui/**` and customized to the control-room theme; no remote shadcn runtime dependency is permitted.

**Styling layer**: Tailwind CSS (via PostCSS) is the styling layer. The existing `globals.css` control-room tokens (`--paper`, `--ink`, `--coal`, `--panel`, `--line`, `--signal`, `--cyan`, `--muted`, `--error`) remain the source of truth and are exposed to Tailwind as shadcn/ui semantic slots per §4.7. The engineer must not introduce a light theme or replace the dark control-room palette.

**Browser-safe data cache**: TanStack Query (`@tanstack/react-query` 5.101.0) is the browser-safe cache for Server Action results. Only `BrowserSafe*` Server Action return types may enter the query cache. Agent RPC origins, Connect transport, `@connectrpc/*`, `@bufbuild/protobuf`, and `packages/client/src/server/agent-rpc/**` / `packages/client/src/generated/agent-rpc/**` modules must never be imported by Client Components or query hooks. Boundaries are fixed in §4.8.

**Client D1 repository**: Drizzle ORM (`drizzle-orm/d1`) is the mandatory repository layer for `packages/client/src/server/db/managed-agents.ts` and `access-credentials.ts`. Drizzle tables model exactly `client_managed_agents` and `client_agent_credential_refs`. Agent domain entities (Thread, Event, Run, Compaction, Memory, Schedule, ToolInvocation, Installation, AdapterConnection, DeliveryContext) are never modeled in Client D1. Prisma is not used anywhere. Boundary details in §4.9.

**React Compiler**: `reactCompiler: true` in `packages/client/next.config.ts` with `babel-plugin-react-compiler` as a Client dev dependency. Components must remain compiler-friendly: pure render, no prop/state mutation, side effects only in effects/event handlers, no manual `useMemo`/`useCallback` for compiler-eligible cases. The compiler does not change the server/client boundary, the `useTransition`/`useFormStatus` pending-state pattern, or the secrecy boundary. Compatibility details in §4.9.

**Form library**: `react-hook-form` + `@hookform/resolvers/zod` + `zod` drive `FormField` validation (per the stack memo). shadcn/ui `Form` is built on `react-hook-form`; the engineer must use that composition rather than a bespoke form state machine. Zod schemas mirror the server-side validation rules in §6.2/§6.4/§6.6/§6.8 and are client-side affordances only — the Server Action remains the source of truth.

**Non-applicable runtimes (explicit, restated from the stack memo)**:

- **React Router** (`react-router`, `react-router-dom`, `@tanstack/react-router`) — not applicable. Next.js App Router owns routing. No `createBrowserRouter`, no `<RouterProvider>`, no client route manifest.
- **Vite SPA** — not a Client runtime/build path. No `vite.config.ts` for the Client app, no `index.html` SPA entry, no Vite `src/main.tsx` entry. Vite may only appear as test/tool transitive infrastructure.
- **Browser Agent RPC** — restated from §2 for the design-system boundary: TanStack Query, shadcn/ui, and React Compiler must never become a vehicle for browser Agent RPC.
- **Prisma** — not used anywhere. Do not add Prisma packages, `schema.prisma`, generated Prisma Client, or Prisma migrations.

**Supply-chain note**: Adding the shadcn/Radix/Tailwind/TanStack/Drizzle/React-Compiler dependencies is an engineer task and must satisfy `pnpm-workspace.yaml` `minimumReleaseAge: 4320` (72 hours) and `allowBuilds` package-by-package approval per the stack memo. The designer does not add dependencies.

### 4.7 Tailwind theme and CSS variable mapping

The existing `:root` tokens in `globals.css` are the source of truth. The engineer maps them to shadcn/ui semantic slots so vendored shadcn/ui components consume the control-room palette without forking. The mapping is expressed either via Tailwind v4 `@theme inline` in `globals.css` or via `tailwind.config.ts` `theme.extend.colors` referencing the CSS variables — the engineer follows the shadcn/ui preset's recommended mechanism. The token mapping itself is fixed:

| Existing control-room CSS variable | shadcn/ui semantic slot                                                                                                                           | Tailwind utility name                                            | Usage                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `--coal` (#0c1014)                 | `--background`                                                                                                                                    | `bg-background`                                                  | App background base                                                      |
| `--paper` (#efe7d0)                | `--foreground`                                                                                                                                    | `text-foreground`                                                | Body text, table cell text                                               |
| `--panel` (rgba paper 0.08)        | `--card`, `--popover`, `--secondary`, `--muted`, `--accent`                                                                                       | `bg-card`, `bg-popover`, `bg-secondary`, `bg-muted`, `bg-accent` | Card/Sheet/Dialog/Popover surfaces, secondary buttons, muted backgrounds |
| `--paper`                          | `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--muted-foreground` (via `--muted`), `--accent-foreground` (via `--cyan`) | corresponding `text-*`                                           | Foreground on those surfaces                                             |
| `--line` (rgba paper 0.22)         | `--border`, `--input`                                                                                                                             | `border-border`, `border-input`                                  | Borders, dividers, input borders                                         |
| `--signal` (#ffb000 amber)         | `--primary`                                                                                                                                       | `bg-primary`, `text-primary`                                     | Primary buttons, active tab underline, pending dot                       |
| `--ink` (#15120d)                  | `--primary-foreground`                                                                                                                            | `text-primary-foreground`                                        | Text on amber `--signal`                                                 |
| `--cyan` (#79e2cf)                 | `--ring`, `--accent-foreground`                                                                                                                   | `ring-ring`, `text-accent-foreground`                            | Focus ring, eyebrows, success accent                                     |
| `--muted` (rgba paper 0.68)        | `--muted-foreground`                                                                                                                              | `text-muted-foreground`                                          | Secondary copy, helper text                                              |
| `--error` (#d96b6b)                | `--destructive`                                                                                                                                   | `bg-destructive`, `text-destructive`                             | Error alert, revoked badge, destructive buttons                          |
| `--paper`                          | `--destructive-foreground`                                                                                                                        | `text-destructive-foreground`                                    | Text on destructive surfaces                                             |

Additional shadcn/ui semantic tokens the engineer must define (mapped to the control-room palette, not new colors):

- `--radius: 1.75rem` (28px) → `--radius-2xl` for `Card`/`ControlRoomFrame`; `--radius-lg: 1.25rem` (20px) for readouts; `--radius-md: 0.75rem` (12px) for inputs/buttons.
- `--ring: var(--cyan)` for focus rings (replaces default shadcn blue).
- Dark mode is the only mode (`color-scheme: dark`). Do not define a light theme. The shadcn/ui `.dark` class is applied at `:root`/`<html>`.

Typography mapping (Tailwind font families):

- `--font-display: "Iowan Old Style", "Palatino Linotype", Palatino, serif` → `font-display` utility for `h1`/`h2`.
- `--font-mono: "IBM Plex Mono", "Courier New", monospace` → `font-mono` utility for eyebrows, labels, tokens, tabular data, `AgentToken`, sequence numbers. shadcn/ui components that default to the sans stack must be overridden to `font-mono` where the wireframe specifies monospace (labels, table cells, badges, agent IDs).

State class mapping (preserve the existing `.state-*` classes as Tailwind `@layer components` or composite utilities so the wireframe's state references in §6 stay valid):

- `.state-loading` → `Skeleton` primitive (shadcn) with the existing 1.2s `skeleton-pulse` keyframe retained for `prefers-reduced-motion: no-preference`.
- `.state-error` → `Alert` variant `destructive` + `--error` text.
- `.state-success` → `--cyan` text + `Check` icon (lucide).
- `.state-disabled` → `aria-disabled="true"` + `opacity-50` + `cursor-not-allowed` utility composition. Do not use the native `disabled` attribute on buttons that must remain screen-reader-announced; use `aria-disabled` + `data-disabled` per shadcn convention.
- `.state-pending` → `Badge` variant `pending` (amber `--signal`) + `Loader2` icon with `animate-spin` (or the existing pulse for dots).

### 4.8 TanStack Query usage boundaries

TanStack Query is permitted only as a browser-safe cache for Server Action results. It must not become a browser Agent RPC transport.

**Permitted**:

- A `QueryClientProvider` in a Client Component boundary (e.g. `packages/client/src/components/providers.tsx`) wrapping Client Component islands that need cached Server Action reads. The provider is mounted in `packages/client/app/layout.tsx`.
- `useQuery({ queryKey, queryFn: () => serverAction(browserSafeInput) })` where `serverAction` is a `"use server"` Server Action returning a `BrowserSafe*` type. Example: `useQuery({ queryKey: ['agent-overview', agentId], queryFn: () => getAgentOverview(agentId) })`.
- `useMutation` wrapping Server Action mutations (`updateAgentConfig`, `rotateAgentCredential`, `cancelRun`, `createSchedule`, `cancelSchedule`, `approveInvocation`, `rejectInvocation`, `installIntegration`, `uninstallIntegration`, `destroyAgent`, `setPinned`, `registerManagedAgent`, `saveCredentialReference`). On success, call `queryClient.invalidateQueries` for the affected keys and rely on `revalidatePath` for Server Component data refresh.
- `useInfiniteQuery` for cursor-paginated Agent-owned lists (Threads, Events, Runs, History). The opaque cursor is part of the query key; page numbers are visual only.
- Optimistic updates only for Client D1-owned fields (pin toggle, sort order). Never optimistic for Agent-owned state (Run status, Tool approval, Integration status) — the Agent RPC result is the source of truth.
- Hydration from Server Component props via `initialData` / `initialTData` to avoid a waterfall refetch on first paint.

**Forbidden**:

- Importing `@connectrpc/connect`, `@connectrpc/connect-web`, `@bufbuild/protobuf`, `packages/client/src/generated/agent-rpc/**`, or `packages/client/src/server/agent-rpc/**` in any Client Component or TanStack Query hook. These are server-only per `CODING_STANDARDS.md` §3 and `[CLIENT-REGISTRY-S003]`.
- Importing `drizzle-orm`, `packages/client/src/server/db/**`, or any Prisma package/path in any Client Component or TanStack Query hook. Drizzle is server-only for Client D1; Prisma is not used anywhere. `[CLIENT-REGISTRY-S002]`.
- Constructing Agent RPC requests, Agent RPC origins, or Connect transports in the browser. `queryFn` must only call Server Actions.
- `fetch()` inside `queryFn` targeting the Agent RPC origin or any external API. `queryFn` must be a Server Action reference, not a network call.
- Caching Agent credential secrets, `credentialRef`, `publicFingerprint`, raw JWT signing material, or Provider secrets in the query cache. Only `BrowserSafe*` return types may enter the cache. `[CLIENT-REGISTRY-S002]`, `[CLIENT-MANAGEMENT-S009]`.
- Using TanStack Query as a router or route manifest. Next.js App Router owns routing.
- `@tanstack/react-query-devtools` in production bundles; dev-only is acceptable.

**Cache key conventions** (engineer to keep stable so invalidation is predictable):

- `['managed-agents']` for the registry list (Client D1).
- `['agent-overview', agentId]`, `['agent-state', agentId]`, `['agent-config', agentId]` for Agent RPC reads.
- `['threads', agentId, filters, cursor]`, `['events', agentId, filters, cursor]`, `['runs', agentId, filters, cursor]`, `['compactions', agentId, threadId?]`, `['thread-memory', agentId, threadId]`, `['thread-history', agentId, query, cursor]`.
- `['schedules', agentId]`, `['tools', agentId]`, `['invocations', agentId, filters]`, `['installations', agentId]`.

**Server Component vs Client Component split**:

- Server Components render the initial shell and call Server Actions directly (no TanStack Query). They pass `BrowserSafe*` props to Client Component children.
- Client Components use TanStack Query for interactive refreshes, filter changes, pagination, and mutation feedback. The initial render is hydrated from Server Component props.
- `revalidatePath` / `revalidateTag` remain the Server Component cache invalidation mechanism. TanStack Query invalidation is the Client Component cache invalidation mechanism. Both coexist; `useMutation.onSuccess` should call `queryClient.invalidateQueries` and the Server Action may additionally call `revalidatePath`.

### 4.9 Drizzle D1 and React Compiler compatibility

**Drizzle D1 boundary**:

- Drizzle ORM is the repository layer for `packages/client/src/server/db/managed-agents.ts` and `access-credentials.ts`. The engineer introduces Drizzle table definitions/queries under `packages/client/src/server/db/**`, preserving the existing `ManagedAgentRepository` and `AccessCredentialRefRepository` interfaces so Server Actions are unaffected.
- Drizzle tables map to exactly two Client-owned D1 tables: `client_managed_agents` and `client_agent_credential_refs`. The schema must not model Agent domain entities (Thread, Event, Run, Compaction, Memory, Schedule, ToolInvocation, Installation, AdapterConnection, DeliveryContext). `forbiddenClientAgentSnapshotTables` in `packages/client/src/server/db/schema.ts` remains the negative contract. `[CLIENT-REGISTRY-S004]`.
- Drizzle usage reconciles with the existing `wrangler d1 migrations apply` flow (`db:migrate:local` / `db:migrate:remote` scripts). `drizzle-kit` is not required for this baseline because the repository already applies explicit SQL migrations; if later added, it needs a concrete migration-generation task and supply-chain review.
- Drizzle ORM is imported only from `packages/client/src/server/db/**` (server-only, behind the existing server-only repository boundary). Browser-visible modules must not import `drizzle-orm` or Client DB modules. Prisma is not used anywhere. This is enforced by existing ESLint boundary rules and `[CLIENT-REGISTRY-S002]`.
- The `credential_ref`, `public_fingerprint`, and secret material columns are never selected into browser-bound payloads. Drizzle `select` projections must return only browser-safe columns; the `BrowserSafeCredentialReference` type is the contract. Server Actions must not return raw database rows directly — only `BrowserSafe*` types cross the server/browser boundary.

**React Compiler compatibility**:

- React Compiler is enabled via `reactCompiler: true` in `packages/client/next.config.ts` with `babel-plugin-react-compiler` as a Client dev dependency (per the stack memo). The engineer must verify `next build` passes with the compiler enabled and the `react-compiler/react-compiler` lint rule is clean.
- Components must be compiler-friendly: pure render, no prop mutation, no state mutation, side effects only in effects/event handlers. shadcn/ui components are already compiler-friendly; bespoke wrappers (§5) must follow the same rules.
- The compiler does not replace `useTransition` / `useFormStatus` for Server Action pending state — keep those for pending UI. The compiler optimizes memoization; it does not change control flow or the server/client boundary.
- `"use client"` directives remain required for Client Components. The compiler does not change the secrecy boundary and must not become a vehicle for browser Agent RPC, Drizzle, database module, or Prisma imports.
- No `useEffect` for derived state; derive in render. No `useMemo`/`useCallback` that the compiler can handle automatically.

### 4.10 Non-applicable runtimes (explicit)

To prevent implementation drift, the following are explicitly out of scope and must not be introduced (restated from the stack memo for the UI boundary):

- **React Router** (`react-router`, `react-router-dom`, `@tanstack/react-router`) — Next.js App Router owns routing. No `createBrowserRouter`, no `<RouterProvider>`, no client route manifest.
- **Vite SPA** — the Client is a Next.js + OpenNext Worker. No `vite.config.ts` for the Client app, no `index.html` SPA entry, no Vite `src/main.tsx` entry.
- **Server-side Agent RPC in the browser** — TanStack Query, shadcn/ui, and React Compiler never become a vehicle for browser Agent RPC. `[CLIENT-REGISTRY-S003]`, `[CLIENT-MANAGEMENT-S009]`.
- **Prisma** — not used anywhere. No Prisma package, schema, generated client, or migration flow is introduced. `[CLIENT-REGISTRY-S004]`.
- **Light theme** — `color-scheme: dark` is the only theme. No shadcn/ui default light theme, no `.light` class, no `prefers-color-scheme: light` branch.

## 5. Component / Section Hierarchy

The bespoke components named in v1 of this wireframe are replaced by shadcn/ui + Radix compositions. The engineer vendors shadcn/ui primitives under `packages/client/src/components/ui/**` and composes route-facing wrappers under `packages/client/src/components/**`. No bespoke primitive implementations are permitted. The wrapper names below are kept as route-facing component names so the §6 route specs remain valid; the mapping table fixes exactly which shadcn/Radix primitives each wrapper composes.

### 5.1 shadcn/ui + Radix primitive mapping

| Wrapper (route-facing name)                             | Exact shadcn/ui + Radix primitive(s)                                                                                                                          | Composition notes                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ControlRoomFrame`                                      | `Card` (Radix `Card.Root` + `Card.Header` + `Card.Content`)                                                                                                   | `Card` with `--radius-2xl` (28px), `--card`/`--border` tokens, layered paper gradient via a `control-room` utility class. Topline + section-nav + page-band slots are `Card.Header` / custom nav / `Card.Content` composition.                                  |
| `SectionNav`                                            | `NavigationMenu` (Radix `NavigationMenu.Root` + `NavigationMenu.List` + `NavigationMenu.Item` + `NavigationMenu.Link`)                                        | Horizontal tab nav. Active item uses `aria-current="page"` + amber underline via `data-active` variant. On mobile, becomes a horizontally scrollable strip with `scroll-snap-type: x proximity` (preserve existing mobile behavior).                            |
| `AgentToken`                                            | `Badge` (Radix `Badge`) variant `outline` + `font-mono`                                                                                                       | Dashed cyan border via `--cyan` token; monospace; `agent_id: <slug>` copy.                                                                                                                                                                                      |
| `SignalBadge`                                           | `Badge` (Radix `Badge`) + `lucide-react` dot icon                                                                                                             | Variants: `active` (amber `--signal`), `pending` (muted), `rotating` (amber pulse), `revoked` (red `--error`), `success` (cyan `--cyan`). `role="img"` + `aria-label` preserved.                                                                                |
| `SkeletonTable`                                         | `Skeleton` (Radix `Skeleton`)                                                                                                                                 | Pulsing rows using `Skeleton` with the existing 1.2s `skeleton-pulse` keyframe. Compose 4 rows × N columns of `Skeleton` blocks.                                                                                                                                |
| `EmptyState`                                            | `Card` + `Badge` eyebrow + `Typography` (h2) + `lead` + `Button`                                                                                              | Centered layout; primary action is `Button` variant `default` (amber `--signal`).                                                                                                                                                                               |
| `ErrorAlert`                                            | `Alert` (Radix `Alert.Root`) variant `destructive` + `AlertTitle` + `AlertDescription` + `Button` (retry)                                                     | `role="alert"` must be added by the wrapper (Radix `Alert` does not set it by default). Retry button calls the Server Action / `queryClient.invalidateQueries`.                                                                                                 |
| `DataTable`                                             | `Table` (Radix `Table.Root` + `Table.Header` + `Table.Body` + `Table.Row` + `Table.Head` + `Table.Cell`)                                                      | Responsive: desktop `<table>` semantics; mobile stacked cards via a `@media (max-width: 820px)` override that maps `Table.Row` to a card layout (preserve existing `data-label` pattern). Sortable headers use `aria-sort`.                                     |
| `DetailDrawer`                                          | `Sheet` (Radix `Dialog.Root` + `Sheet.Content` + `Sheet.Overlay` + `Sheet.Close`)                                                                             | Right-side slide-over on desktop (`side="right"`), full-screen on mobile. Focus trap, Esc to close, return focus to trigger — all provided by Radix Dialog primitives.                                                                                          |
| `ConfirmDialog`                                         | `AlertDialog` (Radix `AlertDialog.Root` + `AlertDialog.Trigger` + `AlertDialog.Content` + `AlertDialog.Cancel` + `AlertDialog.Action`)                        | Explicit confirm/reject. Acting user echo is `aria-live="polite"`. For double-confirm (Destroy Agent), compose `AlertDialog` + `Input` for the type-to-confirm field; `AlertDialogAction` is `aria-disabled` until input matches.                               |
| `FormField`                                             | `Form` (shadcn `Form`, built on `react-hook-form` + `FormField` + `FormItem` + `FormLabel` + `FormControl` + `FormMessage`) + `Input` / `Textarea` / `Select` | `react-hook-form` + `@hookform/resolvers/zod` drive validation. `aria-describedby` linking field to error message is provided by the shadcn `Form` composition. Server Action integration via `useFormState` / `useFormStatus` or TanStack Query `useMutation`. |
| `Input` (text/url/number)                               | `Input` (shadcn, Radix `Slot`)                                                                                                                                | `font-mono` for Agent ID, key ID, fingerprint, masked hint. `autocomplete="off"` on credential-adjacent fields.                                                                                                                                                 |
| `Textarea` (config JSON)                                | `Textarea` (shadcn)                                                                                                                                           | `aria-label="Agent config JSON"`, live region for parse errors.                                                                                                                                                                                                 |
| `Select` (status, trigger type, overlap policy, thread) | `Select` (Radix `Select.Root` + `Select.Trigger` + `Select.Content` + `Select.Item`)                                                                          | Populated server-side (Thread select) or static (status, overlap policy). `aria-label` preserved.                                                                                                                                                               |
| `PaginationBar`                                         | `Pagination` (shadcn) + `Select` (page size)                                                                                                                  | Cursor-based prev/next; page numbers are visual only. `<nav aria-label="Pagination">` preserved.                                                                                                                                                                |
| `FilterBar`                                             | `ToggleGroup` (Radix `ToggleGroup.Root` + `ToggleGroup.Item`) for filter chips + `Input` for search                                                           | Filter chips are `ToggleGroup` type="multiple" with `aria-pressed` semantics; active filter set announced via `aria-live="polite"`.                                                                                                                             |
| `CopySlot`                                              | No primitive — a typed string registry under `packages/client/src/components/copy.ts`                                                                         | Named copy slots for i18n future-proofing. Not a component; a `Record<CopySlotKey, string>` consumed by components.                                                                                                                                             |
| `Button` (primary/secondary/destructive)                | `Button` (shadcn, Radix `Slot` + `class-variance-authority`)                                                                                                  | Variants: `default` (amber `--signal`), `secondary` (panel), `destructive` (`--error`), `outline` (line border), `ghost`. `aria-disabled="true"` for disabled-but-announced state (not native `disabled`).                                                      |
| `Card` (zones)                                          | `Card` (Radix `Card.Root` + `Card.Header` + `Card.Title` + `Card.Description` + `Card.Content`)                                                               | Used for overview zones A/B/C, compaction zones, tool catalog/queue zones.                                                                                                                                                                                      |
| `Tabs` (where applicable)                               | `Tabs` (Radix `Tabs.Root` + `Tabs.List` + `Tabs.Trigger` + `Tabs.Content`)                                                                                    | Optional: if the engineer consolidates in-page sub-views (e.g. Compaction zones A/B/C). The route map in §3 keeps Threads/Events/Runs/Compactions as separate routes with `SectionNav`; `Tabs` is only for in-page sub-views, not route-level navigation.       |
| `Dialog` (non-alert)                                    | `Dialog` (Radix `Dialog.Root` + `Dialog.Content`)                                                                                                             | Used for read-only JSON viewers (Handoff, Memory, Event payload metadata) where there is no confirm/reject action.                                                                                                                                              |
| `Label`                                                 | `Label` (Radix `Label.Root`)                                                                                                                                  | Form labels.                                                                                                                                                                                                                                                    |
| `Progress` (storage bar)                                | `Progress` (Radix `Progress.Root` + `Progress.Indicator`)                                                                                                     | `role="progressbar"` + `aria-valuenow/min/max` preserved by Radix.                                                                                                                                                                                              |
| `Tooltip` (disabled reason)                             | `Tooltip` (Radix `Tooltip.Provider` + `Tooltip.Root` + `Tooltip.Trigger` + `Tooltip.Content`)                                                                 | Used for `aria-disabled` buttons with reason copy (e.g. "Requires settings scope.").                                                                                                                                                                            |
| `Separator`                                             | `Separator` (Radix `Separator.Root`)                                                                                                                          | Section dividers within drawers/cards.                                                                                                                                                                                                                          |
| `ScrollArea`                                            | `ScrollArea` (Radix `ScrollArea.Root` + `ScrollArea.Viewport`)                                                                                                | Used inside `Sheet`/`Dialog` content for long lists (Handoff JSON, Memory items).                                                                                                                                                                               |
| `Sonner` / `Toast`                                      | `Sonner` (shadcn, `sonner`)                                                                                                                                   | Optional transient notifications. The wireframe prefers inline `aria-live` confirmations over toasts; `Sonner` is only for background invalidation notices. Not required for §6.1-§6.8.                                                                         |

All shadcn/ui components are customized to the control-room theme via the §4.7 token mapping. The engineer must not ship the default shadcn light theme or the default blue ring.

### 5.2 Server-renderable vs Client Component

- **Server Components** (no `"use client"`): `ControlRoomFrame`, `SectionNav` (link-based, no JS), `AgentToken`, `SignalBadge` (static), `SkeletonTable` (static placeholder), `EmptyState`, `ErrorAlert` (static), `DataTable` (read-only), `PaginationBar` (link-based), `CopySlot` registry, `Card` zones, `Label`, `Separator`.
- **Client Components** (`"use client"`): `DetailDrawer` (`Sheet`), `ConfirmDialog` (`AlertDialog`), `FormField` (`Form` with Server Action), `FilterBar` (`ToggleGroup` + `Input`), `Tabs` (if interactive), `Dialog` (JSON viewer), `Tooltip`, `Progress` (if animated), `Sonner` (if used), `Select` (when controlled), TanStack Query hooks. Client Components call Server Actions via `useTransition` / `useFormState` / `useFormStatus` / TanStack Query `useMutation`.

All components must remain React Compiler-friendly per §4.9: pure render, no prop/state mutation, side effects only in effects/event handlers.

## 6. Route Specifications

### 6.1 `/agents` — Agent List (Task 11.1)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S001]`, `[CLIENT-REGISTRY-S001]`

**Intent**: Operator lands on the registry and sees all managed Agents with display metadata, pin/order, last-opened time, and connection/credential status. Selecting an Agent updates `last_opened_at` via Server Action and navigates to overview.

**Data source**: Client D1 `client_managed_agents` (registry repo) joined with `client_agent_credential_refs` for status hint. No Agent RPC call on this route (registry is Client-owned).

**Layout (desktop)**:

```
EYEBROW: CLIENT-OWNED MANAGEMENT LEDGER
H2: Managed Agents
LEAD: Agents registered in this Client. Agent domain state lives in the Agent Worker.

┌──────────────────────────────────────────────────────────────────┐
│  [New Agent record]  (primary action, links to /agents/new)        │
└──────────────────────────────────────────────────────────────────┘

┌── DataTable ──────────────────────────────────────────────────────┐
│  PIN │ DISPLAY NAME       │ AGENT ID       │ RPC ORIGIN          │
│  ▲   │ Agent Alpha        │ agent-alpha    │ https://agent...    │
│  ▲   │ Operations Agent   │ ops-agent      │ https://agent...    │
│  ▲   │ Research Agent     │ research-agent │ https://agent...    │
├──────────────────────────────────────────────────────────────────┤
│  LAST OPENED        │ CREDENTIAL │ LIFECYCLE (hint)               │
│  2026-06-21 14:03   │ ● ACTIVE   │ — (requires overview fetch)   │
│  —                  │ ○ PENDING  │ —                              │
│  2026-06-20 09:11   │ ● ACTIVE   │ —                              │
└──────────────────────────────────────────────────────────────────┘
```

**Columns** (left to right):

1. **Pin toggle** — `▲` / `▽` glyph button. Pinned Agents sort to top. `aria-label="Pin {displayName}"` / `aria-label="Unpin {displayName}"`. `aria-pressed` reflects state. Clicking calls `setPinned(agentId, boolean)` Server Action (engineer to add to `managed-agents.ts` if not present).
2. **Display name** — clickable link to `/agents/{agentId}`. Clicking first calls `markManagedAgentOpened(agentId)` then navigates.
3. **Agent ID** — monospace, read-only. `aria-label="Agent ID"`.
4. **RPC origin** — monospace, truncated with `title` attribute for full URL.
5. **Last opened** — localized timestamp; `—` if never opened.
6. **Credential status** — `SignalBadge`: `● ACTIVE` (amber), `○ PENDING` (muted), `⚠ ROTATING` (amber pulsing), `✕ REVOKED` (red). Derived from `client_agent_credential_refs.status`. Never displays the credential ref, key ID, or fingerprint on this route.
7. **Lifecycle hint** — `—` on this route (lifecycle is Agent-owned; full lifecycle shown on overview). Included as a column placeholder so operators know lifecycle requires opening the Agent.

**Sort**: Default sort is `pinned DESC, sort_order ASC, last_opened_at DESC, display_name ASC`. Operator can click column headers for `display_name`, `last_opened_at` to toggle ASC/DESC. Pin always wins.

**States**:

| State                   | Behavior                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                 | `SkeletonTable` with 4 pulsing rows.                                                                                                                                                                                                                     |
| Empty                   | `EmptyState`: eyebrow `EMPTY LEDGER`, heading `Register the first managed Agent.`, lead `Add an Agent ID, RPC origin, and credential reference; Agent domain state remains inside the Agent Worker.`, primary action `New Agent record` → `/agents/new`. |
| Error (D1 read failure) | `ErrorAlert`: `Could not load the Agent registry. Retrying reads from Client D1.` + retry button that re-invokes the Server Component.                                                                                                                   |
| Success (pin toggle)    | Row reorders with a 200ms CSS transform; no full page reload (`revalidatePath` handles data refresh).                                                                                                                                                    |
| Permission denied       | If the operator lacks registry read scope, render `ErrorAlert`: `You do not have permission to view the Agent registry.` with no retry.                                                                                                                  |

**Copy slots**: `agents.list.title`, `agents.list.lead`, `agents.list.empty.eyebrow`, `agents.list.empty.heading`, `agents.list.empty.lead`, `agents.list.action.new`, `agents.list.error.load`, `agents.list.error.permission`.

**Accessibility**:

- The pin toggle is a `<button>` with `aria-pressed`; not a checkbox to preserve the icon semantics.
- Table uses `<table>` semantics with `<th scope="col">` on desktop; on mobile it becomes a `<ul>` of stacked cards with `role="list"` and `aria-label` per card.
- Sortable headers use `aria-sort="ascending|descending|none"`.
- Focus order: New Agent button → first row pin → first row display name link → subsequent rows.

---

### 6.2 `/agents/new` — Add/Edit Agent Form (Task 11.2)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S002]`, `[CLIENT-REGISTRY-S001]`, `[CLIENT-REGISTRY-S002]`

**Intent**: Operator registers a new managed Agent or edits an existing one. The form captures Agent ID, RPC origin, display name, and credential reference metadata. It never captures or transmits plaintext secrets.

**Data source**: Client D1 via `registerManagedAgent` and `saveCredentialReference` Server Actions. On edit (query param `?edit=<agentId>`), pre-fill from `client_managed_agents` + `client_agent_credential_refs` (browser-safe view only).

**Layout (desktop, single-column form within page-band)**:

```
EYEBROW: REGISTRATION
H2: Capture references, not secrets.
LEAD: Register a managed Agent by its ID and RPC origin. Credential
      references are stored as masked hints — never plaintext secrets.

┌── FormField: Agent ID ───────────────────────────────────────────┐
│  Label: Agent ID                                                  │
│  Input: text, monospace, required                                 │
│  Helper: The Durable Object name. Lowercase, kebab-case.          │
│  Error (aria-describedby): "Agent ID is required."                │
└───────────────────────────────────────────────────────────────────┘

┌── FormField: RPC origin ─────────────────────────────────────────┐
│  Label: Agent RPC origin                                          │
│  Input: url, required                                             │
│  Helper: Connect + binary Protobuf endpoint, e.g.                 │
│          https://agent.example.com                                │
│  Error: "RPC origin must be a valid https:// URL."                │
└───────────────────────────────────────────────────────────────────┘

┌── FormField: Display name ───────────────────────────────────────┐
│  Label: Display name                                              │
│  Input: text, required, max 80 chars                              │
│  Helper: Shown in the registry list and overview.                 │
│  Error: "Display name is required (max 80 characters)."           │
└───────────────────────────────────────────────────────────────────┘

┌── FormField: Sort order ─────────────────────────────────────────┐
│  Label: Sort order (optional)                                     │
│  Input: number, default 0                                         │
│  Helper: Lower numbers sort first within pin group.               │
└───────────────────────────────────────────────────────────────────┘

┌── Credential reference section ──────────────────────────────────┐
│  EYEBROW: CREDENTIAL REFERENCE                                    │
│  Helper: The Client stores a reference, key ID, masked hint, and  │
│          status. The secret itself is resolved server-side only.  │
│                                                                    │
│  FormField: Credential reference (text, required)                 │
│    Helper: Opaque reference (e.g. secret path or KMS key ID).     │
│    Error: "Credential reference is required."                     │
│                                                                    │
│  FormField: Key ID (text, required)                               │
│    Error: "Key ID is required."                                   │
│                                                                    │
│  FormField: Public fingerprint (text, required)                   │
│    Helper: Hex fingerprint of the Agent public key.               │
│    Error: "Public fingerprint is required."                       │
│                                                                    │
│  FormField: Masked hint (text, required)                          │
│    Helper: e.g. "ed25519:ab…12" — never the full secret.          │
│    Error: "Masked hint is required."                              │
│                                                                    │
│  FormField: Status (select: active | pending | rotating)          │
│    Default: active                                                 │
└───────────────────────────────────────────────────────────────────┘

┌── Action row ────────────────────────────────────────────────────┐
│  [Cancel]  (links to /agents)                                      │
│  [Register Agent]  (primary submit, disabled until valid)         │
└───────────────────────────────────────────────────────────────────┘
```

**Validation rules** (enforced server-side; mirrored client-side for affordance only):

| Field                | Rule                                                                      | Error copy                                                                                                            |
| -------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Agent ID             | non-empty, `^[a-z0-9][a-z0-9-]{0,62}$`, unique in `client_managed_agents` | `Agent ID is required.` / `Agent ID must be lowercase kebab-case (max 63 chars).` / `Agent ID is already registered.` |
| RPC origin           | non-empty, `https://` URL, max 2048 chars                                 | `RPC origin must be a valid https:// URL.`                                                                            |
| Display name         | non-empty, max 80 chars                                                   | `Display name is required (max 80 characters).`                                                                       |
| Sort order           | integer >= 0, optional                                                    | `Sort order must be a non-negative integer.`                                                                          |
| Credential reference | non-empty, max 512 chars                                                  | `Credential reference is required.`                                                                                   |
| Key ID               | non-empty, max 128 chars                                                  | `Key ID is required.`                                                                                                 |
| Public fingerprint   | non-empty, max 128 chars                                                  | `Public fingerprint is required.`                                                                                     |
| Masked hint          | non-empty, max 64 chars                                                   | `Masked hint is required.`                                                                                            |
| Status               | one of `active`, `pending`, `rotating`                                    | `Status must be active, pending, or rotating.`                                                                        |

**States**:

| State                                                | Behavior                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading (submit)                                     | Submit button shows `.state-pending` amber dot + `Registering…` copy. All fields `disabled`.                                                                                   |
| Validation error                                     | Each invalid field shows its `ErrorAlert` inline, `aria-describedby` links field to error. First invalid field receives focus. `role="alert"` on the form-level error summary. |
| Success                                              | `revalidatePath('/agents')` fires; redirect to `/agents/{agentId}` overview. Transient `.state-success` cyan confirmation on overview load.                                    |
| Server error (D1 write failure)                      | `ErrorAlert`: `Could not register the Agent. Retrying will not duplicate the record if the Agent ID already exists.` + retry button.                                           |
| Server error (Agent RPC unreachable on edit prefill) | `ErrorAlert`: `Agent overview could not be loaded. The registry record was not changed.` (Edit mode only; the form stays editable for Client-owned fields.)                    |
| Permission denied                                    | `ErrorAlert`: `You do not have permission to register Agents.` Form disabled.                                                                                                  |
| Optimistic duplicate                                 | If `registerManagedAgent` returns an already-exists result, surface as validation error on Agent ID field, not a toast.                                                        |

**Copy slots**: `agents.new.title`, `agents.new.lead`, `agents.new.section.credential`, `agents.new.field.agentId.*`, `agents.new.field.rpcOrigin.*`, `agents.new.field.displayName.*`, `agents.new.field.sortOrder.*`, `agents.new.field.credentialRef.*`, `agents.new.field.keyId.*`, `agents.new.field.publicFingerprint.*`, `agents.new.field.maskedHint.*`, `agents.new.field.status.*`, `agents.new.action.cancel`, `agents.new.action.submit`, `agents.new.error.duplicate`, `agents.new.error.permission`, `agents.new.error.server`.

**Accessibility**:

- Every `FormField` uses `<label for>` + `aria-describedby` pointing to the error node id.
- Form-level error summary at top with `role="alert"` and `aria-live="assertive"`; on re-submit, clear previous errors.
- Submit button is `<button type="submit">`; disabled state uses `aria-disabled="true"` (not `disabled` attribute) so screen readers still announce it.
- Focus order: Agent ID → RPC origin → Display name → Sort order → Credential ref → Key ID → Public fingerprint → Masked hint → Status → Cancel → Submit.
- On mobile, the form is single-column; the credential reference section collapses into a `<details>` element with `<summary>Credential reference</summary>` to reduce scroll fatigue.

**Browser secrecy notes**:

- The `credentialRef` field is a **reference string**, never a secret. The helper copy makes this explicit.
- `saveCredentialReference` returns `BrowserSafeCredentialReference` which strips `credentialRef` and `publicFingerprint` from the browser-bound payload. The form does not echo the saved `credentialRef` back on success; it only shows the masked hint.
- No `localStorage` / `sessionStorage` writes. No autocomplete attributes that would persist secret-like values (`autocomplete="off"` on credential fields).

---

### 6.3 `/agents/[agentId]` — Agent Overview (Task 11.3)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S003]`, `[CLIENT-REGISTRY-S004]`

**Intent**: Single-screen summary of Agent profile, lifecycle, config version, credential generation/status, and capability summary. All data fetched live from Agent RPC; nothing cached in Client D1.

**Data source**: `getAgentOverview(agentId, actingUser)` + `getAgentState(agentId, actingUser)` Server Actions. These call `AgentLifecycleService.GetAgent` and `AgentStateService.GetState`.

**Layout (desktop, 3-zone grid)**:

```
EYEBROW: AGENT OVERVIEW
H2: {displayName}
agent_id: {agentId}   (AgentToken chip)

┌── Zone A: Profile + lifecycle ───────────────────────────────────┐
│  LIFECYCLE STATUS    ● ACTIVE / ○ INITIALIZING / ✕ DESTROYED      │
│  CONFIG VERSION      v{configVersion}                              │
│  CREDENTIAL          generation {generation} · {status}            │
│                       key id: {keyId}  (masked)                    │
│  LAST OPENED         {lastOpenedAt}  (from registry)               │
└───────────────────────────────────────────────────────────────────┘

┌── Zone B: Capability summary ────────────────────────────────────┐
│  EYEBROW: CAPABILITIES                                             │
│  • Threads: {threadCount}                                          │
│  • Active Run: {activeRunId or "none"}                             │
│  • Pending Runs: {pendingRunCount}                                 │
│  • Schedules: {scheduleCount}                                      │
│  • Tools: {toolCount}                                              │
│  • Integrations: {installationCount}                               │
└───────────────────────────────────────────────────────────────────┘

┌── Zone C: Storage / health signal ───────────────────────────────┐
│  EYEBROW: STORAGE & HEALTH                                         │
│  DO storage: {percent}%  (warning/critical badge)                  │
│  R2 archive: {bytes}                                               │
│  Health: ● SERVING / ◑ DEGRADED / ✕ UNAVAILABLE                    │
│  (safe metadata only — no secrets, no raw stack)                   │
└───────────────────────────────────────────────────────────────────┘

┌── Action row ────────────────────────────────────────────────────┐
│  [Open Settings]  → /agents/{agentId}/settings                     │
│  [View Threads]  → /agents/{agentId}/threads                       │
│  [View Runs]     → /agents/{agentId}/runs                          │
└───────────────────────────────────────────────────────────────────┘
```

**Fields** (from `BrowserSafeAgentOverview` + `BrowserSafeAgentState`):

| Field                          | Source                                       | Display                           |
| ------------------------------ | -------------------------------------------- | --------------------------------- |
| `displayName`                  | registry (Client D1)                         | H2                                |
| `agentId`                      | registry                                     | `AgentToken` chip                 |
| `lifecycleStatus`              | `BrowserSafeAgentOverview.lifecycleStatus`   | `SignalBadge`                     |
| `configVersion`                | `BrowserSafeAgentOverview.configVersion`     | monospace `v{n}`                  |
| `credential.generation`        | `BrowserSafeAgentCredential.generation`      | `generation {n}`                  |
| `credential.status`            | `BrowserSafeAgentCredential.status`          | `SignalBadge`                     |
| `credential.keyId`             | `BrowserSafeAgentCredential.keyId`           | monospace, masked if present      |
| `credential.publicFingerprint` | NOT displayed                                | — (stripped by browser-safe view) |
| `capabilitySummary`            | `BrowserSafeAgentOverview.capabilitySummary` | bulleted list                     |
| `state.storagePercent`         | `BrowserSafeAgentState.state`                | progress bar + badge              |
| `lastOpenedAt`                 | registry                                     | localized timestamp               |

**States**:

| State                                   | Behavior                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                 | `SkeletonTable`-style pulsing zones for A/B/C.                                                                                               |
| Agent not found (registry)              | `ErrorAlert`: `This Agent is not registered in the Client ledger.` + link to `/agents`.                                                      |
| Agent not found (Agent RPC `not_found`) | `ErrorAlert`: `The Agent Worker has no aggregate for this Agent ID. Verify the Agent ID and RPC origin in Settings.` + link to settings.     |
| Agent RPC `unavailable`                 | `ErrorAlert`: `Agent overview is temporarily unavailable. Safe metadata only is shown.` + retry button.                                      |
| Agent destroyed                         | Lifecycle badge `✕ DESTROYED`; all mutation links hidden; copy: `This Agent is destroyed. History remains viewable; mutations are disabled.` |
| Permission denied                       | `ErrorAlert`: `You do not have permission to view this Agent.` No zones rendered.                                                            |
| Success                                 | Zones render with cyan eyebrow accents.                                                                                                      |

**Copy slots**: `agents.overview.title`, `agents.overview.zone.profile`, `agents.overview.zone.capabilities`, `agents.overview.zone.health`, `agents.overview.action.settings`, `agents.overview.action.threads`, `agents.overview.action.runs`, `agents.overview.error.notRegistered`, `agents.overview.error.notFound`, `agents.overview.error.unavailable`, `agents.overview.error.permission`, `agents.overview.destroyed.notice`.

**Accessibility**:

- Zones are `<section aria-labelledby>` with eyebrow as the heading.
- `SignalBadge` uses `role="img"` with `aria-label` describing the status.
- Storage progress bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Durable Object storage usage"`.
- Focus order: H2 → AgentToken → Zone A fields → Zone B list → Zone C → action row.

---

### 6.4 `/agents/[agentId]/settings` — Settings (Task 11.4)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S004]`, `[CLIENT-REGISTRY-S002]`

**Intent**: Operator updates Agent config and rotates credentials. Both mutations go through Server Actions with `ActingUserContext`. Post-submit, the page refreshes via `revalidatePath` and shows updated `configVersion` or `credential.generation`.

**Data source**: `getAgentConfig` (read), `updateAgentConfig` (mutate), `rotateAgentCredential` (mutate), `saveCredentialReference` (persist new ref after rotation).

**Layout (desktop, two stacked form sections)**:

```
EYEBROW: SETTINGS
H2: Agent configuration and credentials
agent_id: {agentId}

┌── Section: Config ───────────────────────────────────────────────┐
│  Current config version: v{configVersion}                         │
│  Config (JSON editor, read-only by default):                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ { ...config JSON, syntax-highlighted, monospace }            │  │
│  └────────────────────────────────────────────────────────────┘  │
│  [Edit config]  (toggles editor to editable)                      │
│                                                                    │
│  (when editing):                                                   │
│  Config JSON (textarea, required, must parse as JSON)             │
│  Helper: Changes are sent to AgentStateService.UpdateConfig.      │
│  Error: "Config must be valid JSON." / "Config update failed:     │
│          {safe Connect code message}."                            │
│  [Cancel edit]  [Save config]  (ConfirmDialog: "Update config?    │
│                This will create config version {n+1}.")           │
└───────────────────────────────────────────────────────────────────┘

┌── Section: Credential rotation ──────────────────────────────────┐
│  Current credential:                                               │
│    generation {generation} · {status} · key id {keyId}            │
│    masked hint: {maskedHint}                                       │
│                                                                    │
│  [Rotate credential]  (opens ConfirmDialog)                        │
│                                                                    │
│  ConfirmDialog:                                                    │
│    "Rotate Agent credential?"                                      │
│    "A new credential generation will become active. The previous   │
│     generation remains valid during the overlap window. Acting     │
│     user: {actingUserId}."                                         │
│    [Cancel]  [Rotate]                                              │
│                                                                    │
│  (after rotation, if Agent RPC returns new reference material):    │
│    FormField: New credential reference (required)                  │
│    FormField: New key ID (required)                                │
│    FormField: New public fingerprint (required)                    │
│    FormField: New masked hint (required)                           │
│    [Save new reference]  → saveCredentialReference                 │
└───────────────────────────────────────────────────────────────────┘

┌── Section: Danger zone ──────────────────────────────────────────┐
│  EYEBROW: DANGER ZONE                                              │
│  [Destroy Agent]  (ConfirmDialog with double-confirm)              │
│    "Destroy Agent {agentId}?"                                      │
│    "This disables all mutating Agent operations. History is        │
│     preserved. This action is irreversible."                       │
│    Type the Agent ID to confirm: [text input]                      │
│    [Cancel]  [Destroy permanently]  (disabled until input matches) │
└───────────────────────────────────────────────────────────────────┘
```

**States**:

| State                       | Behavior                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Loading                     | Skeleton zones for config + credential.                                                                 |
| Config edit mode            | Textarea becomes editable; Save/Cancel appear; `aria-live="polite"` announces "Config editor active."   |
| Config save pending         | Save button `.state-pending`; Cancel disabled.                                                          |
| Config save success         | `revalidatePath`; cyan confirmation `Config updated to v{n+1}.`; editor returns to read-only.           |
| Config save error           | `ErrorAlert` with safe Connect code message; editor stays editable so operator can fix and retry.       |
| Credential rotation pending | Rotate button `.state-pending`; ConfirmDialog stays open with disabled controls.                        |
| Credential rotation success | New reference form appears; cyan confirmation `Credential generation {n+1} is active.`                  |
| Credential rotation error   | `ErrorAlert` with safe message; ConfirmDialog stays open for retry.                                     |
| Destroy pending             | Destroy button `.state-pending`; double-confirm input cleared.                                          |
| Destroy success             | Redirect to `/agents` with transient confirmation `Agent {agentId} destroyed.`                          |
| Destroy error               | `ErrorAlert`; double-confirm input preserved for retry.                                                 |
| Permission denied (read)    | `ErrorAlert`: `You do not have permission to view Agent settings.`                                      |
| Permission denied (mutate)  | All mutate buttons `.state-disabled` with `aria-disabled="true"` and tooltip `Requires settings scope.` |

**Copy slots**: `agents.settings.title`, `agents.settings.section.config`, `agents.settings.section.credential`, `agents.settings.section.danger`, `agents.settings.config.action.edit`, `agents.settings.config.action.cancel`, `agents.settings.config.action.save`, `agents.settings.config.confirm.heading`, `agents.settings.config.confirm.body`, `agents.settings.config.error.json`, `agents.settings.config.error.save`, `agents.settings.credential.action.rotate`, `agents.settings.credential.confirm.heading`, `agents.settings.credential.confirm.body`, `agents.settings.credential.success`, `agents.settings.credential.error`, `agents.settings.destroy.action`, `agents.settings.destroy.confirm.heading`, `agents.settings.destroy.confirm.body`, `agents.settings.destroy.confirm.inputLabel`, `agents.settings.destroy.confirm.action`, `agents.settings.destroy.success`, `agents.settings.destroy.error`, `agents.settings.error.permission`.

**Accessibility**:

- ConfirmDialog uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the heading. Focus traps within the dialog; Esc closes (Cancel semantics).
- Double-confirm text input has `autocomplete="off"` and `aria-describedby` explaining the match requirement.
- Config JSON textarea has `aria-label="Agent config JSON"` and a live region for parse errors.
- Acting user echo in ConfirmDialog is `aria-live="polite"` so screen readers announce who will perform the mutation.

**Browser secrecy notes**:

- `rotateAgentCredential` returns `BrowserSafeCredentialRotationResult` which strips secret material. The new reference form captures the **reference** (opaque string), not the secret.
- The previous credential's `publicFingerprint` is never displayed. Only `keyId`, `generation`, `status`, `maskedHint` are shown.

---

### 6.5 Thread / Event / Run / Compaction / Memory Views (Task 11.5)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S005]`, `[CLIENT-REGISTRY-S004]`

This task spans four subroutes: `/threads`, `/events`, `/runs`, `/compactions`. All data is Agent-owned and fetched live via Agent RPC. No Client D1 persistence.

#### 6.5.1 `/agents/[agentId]/threads`

**Data source**: `listThreads`, `getThread`.

**Layout (desktop, list + detail drawer)**:

```
EYEBROW: THREADS
H2: Agent-owned Thread history
agent_id: {agentId}

┌── FilterBar ─────────────────────────────────────────────────────┐
│  [All] [Active] [Compacted] [System]   Search: [thread_key…]      │
└───────────────────────────────────────────────────────────────────┘

┌── DataTable ─────────────────────────────────────────────────────┐
│  THREAD KEY        │ STATUS    │ SECTIONS │ LATEST EVENT          │
│  inbox:tenant:123  │ active    │ 4        │ 2026-06-21 14:03      │
│  project:ai-agent  │ compacted │ 12       │ 2026-06-20 09:11      │
│  __system__        │ system    │ 1        │ 2026-06-21 14:00      │
└───────────────────────────────────────────────────────────────────┘

┌── PaginationBar ─────────────────────────────────────────────────┐
│  ‹ Prev   Page 1 of 3   Next ›   Page size: [25]                  │
└───────────────────────────────────────────────────────────────────┘

(row click opens DetailDrawer on the right; on mobile, full-screen sheet)
```

**DetailDrawer content** (for selected Thread):

```
EYEBROW: THREAD DETAIL
thread_id: {threadId}
thread_key: {threadKey}
status: {status}
current_section_id: {currentSectionId}

LATEST EVENT
  event_id: {eventId}
  type: {eventType}
  agent_sequence: {agentSequence}
  thread_sequence: {threadSequence}

LATEST RUN (if any)
  run_id: {runId}
  status: {runStatus}

[Open Events for this Thread]  → /agents/{agentId}/events?thread={threadId}
[Open Runs for this Thread]    → /agents/{agentId}/runs?thread={threadId}
[Open Compactions]             → /agents/{agentId}/compactions?thread={threadId}
```

**States**: standard loading/empty/error/permission-denied. Empty copy: `No Threads yet. Threads appear when the Agent accepts Events with thread_key.`

**Copy slots**: `agents.threads.title`, `agents.threads.filter.all`, `agents.threads.filter.active`, `agents.threads.filter.compacted`, `agents.threads.filter.system`, `agents.threads.search.placeholder`, `agents.threads.empty.heading`, `agents.threads.empty.lead`, `agents.threads.detail.eyebrow`, `agents.threads.detail.action.events`, `agents.threads.detail.action.runs`, `agents.threads.detail.action.compactions`, `agents.threads.error.load`.

#### 6.5.2 `/agents/[agentId]/events`

**Data source**: `listEvents`. Supports `?thread={threadId}` filter from the Threads drawer.

**Layout (desktop, dense table)**:

```
EYEBROW: EVENTS
H2: AgentEvent log
agent_id: {agentId}

┌── FilterBar ─────────────────────────────────────────────────────┐
│  Thread: [all ▾]   Type: [all ▾]   Source: [all ▾]                │
│  Search: [event_id or correlation_id…]                            │
└───────────────────────────────────────────────────────────────────┘

┌── DataTable ─────────────────────────────────────────────────────┐
│  AGENT SEQ │ THREAD SEQ │ TYPE                  │ SOURCE          │
│  00042     │ 00017      │ user.message.received │ integration-adapter │
│  00043     │ 00018      │ schedule.triggered    │ agent-scheduler │
├───────────────────────────────────────────────────────────────────┤
│  OCCURRED AT        │ CORRELATION │ PAYLOAD                         │
│  2026-06-21 14:03   │ req-abc     │ inline (1.2 KiB)  [view]       │
│  2026-06-21 14:04   │ —           │ R2 ref (digest)   [view]       │
└───────────────────────────────────────────────────────────────────┘
```

- `[view]` on payload opens a read-only drawer showing either inline JSON (if <= 64 KiB) or R2 reference metadata (digest, size, ref). Never fetches the R2 blob into the browser; shows metadata only.
- Sequence columns are monospace and zero-padded for vertical alignment.

**States**: Empty copy: `No Events yet. Events are appended when the Agent accepts external or internal input.`

**Copy slots**: `agents.events.title`, `agents.events.filter.thread`, `agents.events.filter.type`, `agents.events.filter.source`, `agents.events.search.placeholder`, `agents.events.empty.heading`, `agents.events.empty.lead`, `agents.events.payload.inline`, `agents.events.payload.r2ref`, `agents.events.error.load`.

#### 6.5.3 `/agents/[agentId]/runs`

**Data source**: `listRuns`, `getRun`, `cancelRun`.

**Layout (desktop, list + detail + cancel)**:

```
EYEBROW: RUNS
H2: AgentRun history and scheduler
agent_id: {agentId}

┌── FilterBar ─────────────────────────────────────────────────────┐
│  Status: [all ▾] [pending] [running] [waiting_tool]               │
│  [waiting_approval] [completed] [failed] [cancelled] [interrupted]│
│  Thread: [all ▾]   Time range: [from] [to]                        │
└───────────────────────────────────────────────────────────────────┘

┌── DataTable ─────────────────────────────────────────────────────┐
│  RUN ID    │ STATUS            │ THREAD        │ STARTED AT        │
│  run-001   │ ● running         │ inbox:123     │ 2026-06-21 14:03 │
│  run-002   │ ◑ waiting_tool    │ project:ai    │ 2026-06-21 14:05 │
│  run-003   │ ✓ completed       │ __system__    │ 2026-06-21 14:00 │
└───────────────────────────────────────────────────────────────────┘

(row click opens DetailDrawer)
```

**DetailDrawer content**:

```
EYEBROW: RUN DETAIL
run_id: {runId}
status: {status}
thread_id: {threadId}
started_at: {startedAt}
ended_at: {endedAt}

SNAPSHOT (immutable)
  trigger event range: {fromEventSeq} → {toEventSeq}
  thread memory version: {memoryVersion}
  latest ready compaction: {compactionId}
  uncompacted upper sequence: {upperSeq}
  config version: {configVersion}
  tool set version: {toolSetVersion}
  integration version: {integrationVersion}

CAUSAL LINKS
  correlation_id: {correlationId}
  causation_id: {causationId}

SAFE ERROR DETAIL (if failed)
  {safe Connect code message}

[Cancel Run]  (only for pending/running/waiting_*; opens ConfirmDialog)
```

**Cancel Run ConfirmDialog**:

- Heading: `Cancel Run {runId}?`
- Body: `The Agent scheduler will interrupt this Run. If the Run is already terminal, the cancel is replayed as a no-op. Acting user: {actingUserId}.`
- Buttons: `[Cancel]` `[Cancel Run]`

**States**:

- Cancel pending: button `.state-pending`; ConfirmDialog controls disabled.
- Cancel success: `revalidatePath`; cyan confirmation `Run {runId} cancellation accepted.`; drawer closes or updates status.
- Cancel error: `ErrorAlert` with safe message; drawer stays open.
- Run not found: `ErrorAlert`: `Run {runId} was not found. It may have been garbage-collected.`

**Copy slots**: `agents.runs.title`, `agents.runs.filter.*`, `agents.runs.empty.heading`, `agents.runs.empty.lead`, `agents.runs.detail.eyebrow`, `agents.runs.detail.snapshot`, `agents.runs.detail.causal`, `agents.runs.detail.error`, `agents.runs.cancel.action`, `agents.runs.cancel.confirm.heading`, `agents.runs.cancel.confirm.body`, `agents.runs.cancel.success`, `agents.runs.cancel.error`, `agents.runs.error.notFound`, `agents.runs.error.load`.

#### 6.5.4 `/agents/[agentId]/compactions`

**Data source**: `getLatestCompaction`, `getThreadMemory`, `searchThreadHistory`.

**Layout (desktop, 3-zone vertical)**:

```
EYEBROW: COMPACTION & MEMORY
H2: Section boundaries, Handoff, History, Memory
agent_id: {agentId}

┌── Zone A: Latest compaction ─────────────────────────────────────┐
│  EYEBROW: LATEST READY COMPACTION                                  │
│  compaction_id: {compactionId}                                     │
│  section_id: {sectionId}                                           │
│  status: {status}                                                  │
│  ordinal: {ordinal}                                                │
│  event range: {fromSeq} → {toSeq}                                  │
│  HANDOFF (summary):                                                │
│    situation: {situation}                                          │
│    goals: {goals}                                                  │
│    open loops: {openLoops}                                         │
│    expected next: {expectedNext}                                   │
│  [View full Handoff]  (opens drawer with full Handoff JSON)        │
└───────────────────────────────────────────────────────────────────┘

┌── Zone B: Thread memory ─────────────────────────────────────────┐
│  EYEBROW: THREAD MEMORY                                            │
│  active version: {memoryVersion}                                   │
│  ITEMS:                                                            │
│  • {memoryItem.summary} — {provenance} (v{itemVersion})            │
│    status: {active|superseded|invalidated}                         │
│  [View full Memory]  (opens drawer)                                │
└───────────────────────────────────────────────────────────────────┘

┌── Zone C: History search ────────────────────────────────────────┐
│  EYEBROW: THREAD HISTORY SEARCH                                    │
│  Search: [query…]   Filters: [section] [event range]               │
│  RESULTS:                                                          │
│  • {historyEntry.chronology} — {decisions}                         │
│    rationale: {rationale}                                          │
│    provenance: {provenance}                                        │
│  [Load more]  (cursor pagination)                                  │
└───────────────────────────────────────────────────────────────────┘
```

- Full Handoff / Memory drawers show JSON in a read-only monospace viewer. Large History bodies show R2 reference metadata (digest, size) with a `[view ref]` link that does **not** fetch the blob into the browser.
- Provenance is always shown alongside Memory items and History entries so the operator can trace `compaction_id` / `event_id` lineage.

**States**: Empty copy: `No compactions yet. Compactions appear after the Agent freezes a Section and generates Handoff/History/Memory.`

**Copy slots**: `agents.compactions.title`, `agents.compactions.zone.latest`, `agents.compactions.zone.memory`, `agents.compactions.zone.history`, `agents.compactions.handoff.view`, `agents.compactions.memory.view`, `agents.compactions.history.search`, `agents.compactions.history.loadMore`, `agents.compactions.empty.heading`, `agents.compactions.empty.lead`, `agents.compactions.error.load`.

**Accessibility (shared across 6.5)**:

- All four subroutes use the same `DataTable` + `DetailDrawer` pattern.
- Drawer uses `role="dialog"`, `aria-modal="true"`, focus trap, Esc to close.
- Filter chips are `<button aria-pressed>` toggles; the active filter set is announced via `aria-live="polite"`.
- Pagination uses `<nav aria-label="Pagination">` with `<a>` links (or buttons if JS-driven).
- Sequence numbers are `aria-label`-expanded (e.g. `agent sequence 42`).

---

### 6.6 `/agents/[agentId]/schedules` — Schedule UI (Task 11.6)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S006]`

**Data source**: `listSchedules`, `createSchedule`, `cancelSchedule`.

**Layout (desktop, list + create form panel)**:

```
EYEBROW: SCHEDULES
H2: Agent-owned Schedules
agent_id: {agentId}

┌── Action row ────────────────────────────────────────────────────┐
│  [New Schedule]  (toggles create panel)                            │
└───────────────────────────────────────────────────────────────────┘

┌── Create panel (collapsible) ────────────────────────────────────┐
│  FormField: Thread (select, required — lists Threads via listThreads)│
│    Helper: Schedule fires a schedule.triggered Event into this Thread.│
│    Error: "Thread is required."                                    │
│  FormField: Trigger type (select: one-shot | interval)             │
│  FormField: Fire at (datetime-local, required if one-shot)         │
│  FormField: Interval seconds (number, required if interval)        │
│  FormField: Overlap policy (select: skip | coalesce | queue-next)  │
│    Helper: skip: ignore if prior callback active.                  │
│            coalesce: merge into pending Run.                       │
│            queue-next: enqueue a separate Run.                     │
│  FormField: Idempotency key (text, optional, auto-generated)       │
│  [Cancel]  [Create Schedule]  (ConfirmDialog: "Create Schedule?    │
│            Acting user: {actingUserId}.")                          │
└───────────────────────────────────────────────────────────────────┘

┌── DataTable ─────────────────────────────────────────────────────┐
│  SCHEDULE ID │ THREAD        │ TYPE      │ OVERLAP    │ NEXT FIRE  │
│  sch-001     │ inbox:123     │ interval  │ coalesce   │ 14:05      │
│  sch-002     │ project:ai    │ one-shot  │ skip       │ 2026-06-22 │
├───────────────────────────────────────────────────────────────────┤
│  STATUS      │ ACTIONS                                                │
│  ● active    │ [View] [Cancel]                                        │
│  ◑ pending   │ [View] [Cancel]                                        │
│  ✓ cancelled │ [View]                                                 │
└───────────────────────────────────────────────────────────────────┘
```

**Cancel Schedule ConfirmDialog**:

- Heading: `Cancel Schedule {scheduleId}?`
- Body: `Future firings will be prevented. Already-pending Runs are not cancelled. Acting user: {actingUserId}.`
- Buttons: `[Cancel]` `[Cancel Schedule]`

**States**:

| State                          | Behavior                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                        | Skeleton list.                                                                                                                                                                      |
| Empty                          | `EmptyState`: eyebrow `NO SCHEDULES`, heading `No Schedules yet.`, lead `Create a Schedule to fire future schedule.triggered Events into a Thread.`, primary action `New Schedule`. |
| Create pending                 | Submit `.state-pending`; panel controls disabled.                                                                                                                                   |
| Create success                 | `revalidatePath`; cyan confirmation `Schedule {scheduleId} created.`; panel collapses.                                                                                              |
| Create error (Thread required) | Inline validation on Thread field.                                                                                                                                                  |
| Create error (Agent RPC)       | `ErrorAlert` with safe Connect code; panel stays open.                                                                                                                              |
| Cancel pending                 | Button `.state-pending`; dialog controls disabled.                                                                                                                                  |
| Cancel success                 | `revalidatePath`; cyan confirmation `Schedule {scheduleId} cancelled.`                                                                                                              |
| Cancel error                   | `ErrorAlert`; dialog stays open.                                                                                                                                                    |
| Permission denied              | Create button `.state-disabled`; cancel buttons hidden.                                                                                                                             |

**Copy slots**: `agents.schedules.title`, `agents.schedules.action.new`, `agents.schedules.create.field.thread.*`, `agents.schedules.create.field.type.*`, `agents.schedules.create.field.fireAt.*`, `agents.schedules.create.field.interval.*`, `agents.schedules.create.field.overlap.*`, `agents.schedules.create.field.idempotency.*`, `agents.schedules.create.action.cancel`, `agents.schedules.create.action.submit`, `agents.schedules.create.confirm.heading`, `agents.schedules.create.confirm.body`, `agents.schedules.create.success`, `agents.schedules.create.error`, `agents.schedules.cancel.confirm.heading`, `agents.schedules.cancel.confirm.body`, `agents.schedules.cancel.success`, `agents.schedules.cancel.error`, `agents.schedules.empty.*`, `agents.schedules.error.permission`, `agents.schedules.error.load`.

**Accessibility**:

- Create panel uses `<details>`/`<summary>` semantics or ARIA-equivalent toggle with `aria-expanded`.
- Thread select is a `<select>` populated server-side from `listThreads`; `aria-label="Target Thread"`.
- Overlap policy helper text is `aria-describedby` linked to the select.
- Cancel button is disabled when status is `cancelled` or `completed` (`aria-disabled="true"`).

---

### 6.7 `/agents/[agentId]/tools` — Tool Catalog / Approval UI (Task 11.7)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S007]`

**Data source**: `listTools`, `listInvocations`, `approveInvocation`, `rejectInvocation`.

**Layout (desktop, two zones: catalog + approval queue)**:

```
EYEBROW: TOOLS
H2: Tool catalog and approval queue
agent_id: {agentId}

┌── Zone A: Tool catalog ──────────────────────────────────────────┐
│  EYEBROW: CATALOG                                                  │
│  DataTable:                                                        │
│  TOOL ID            │ NAME              │ STATUS    │ INSTALLATION │
│  message.send       │ Message Send      │ ● enabled │ install-001  │
│  web.search         │ Web Search        │ ○ disabled│ —            │
│  requires_approval  │ (badge)                                     │
└───────────────────────────────────────────────────────────────────┘

┌── Zone B: Approval queue ────────────────────────────────────────┐
│  EYEBROW: APPROVAL QUEUE                                           │
│  DataTable:                                                        │
│  INVOCATION ID │ TOOL          │ STATUS           │ APPROVAL       │
│  inv-001       │ message.send  │ pending_approval │ ◑ awaiting     │
│  inv-002       │ web.search    │ approved         │ ✓ approved     │
├───────────────────────────────────────────────────────────────────┤
│  ATTEMPTS │ RISK │ ACTING USER │ ACTIONS                           │
│  1        │ med │ —           │ [Review]                          │
│  1        │ low │ alice       │ [View result]                     │
└───────────────────────────────────────────────────────────────────┘

([Review] opens a DetailDrawer with explicit approve/reject)
```

**Approval DetailDrawer**:

```
EYEBROW: TOOL INVOCATION REVIEW
invocation_id: {invocationId}
tool: {toolId} — {toolName}
status: {status}
approval_status: {approvalStatus}
attempts: {attempts}
thread_id: {threadId}
run_id: {runId}
installation_id: {installationId}

INPUT SUMMARY (safe projection, no raw secret)
  {inputSummary}

RISK / APPROVAL METADATA
  risk level: {riskLevel}
  requires_approval: true
  rationale (if provided by harness): {rationale}

ACTING USER
  {actingUserId or "—"}

RESULT LINKS (if terminal)
  result Event: {resultEventId}  [view]
  output ref: {outputRef}        [view metadata]

┌── Explicit action row ──────────────────────────────────────────┐
│  [Reject]  (secondary)                                            │
│  [Approve]  (primary, requires explicit click — no default focus) │
└───────────────────────────────────────────────────────────────────┘

(Approve/Reject opens a final ConfirmDialog)
```

**Approve ConfirmDialog**:

- Heading: `Approve Tool invocation {invocationId}?`
- Body: `The Agent will execute {toolName}. This action is recorded with acting user {actingUserId}. It cannot be undone.`
- Buttons: `[Cancel]` `[Approve]`

**Reject ConfirmDialog**:

- Heading: `Reject Tool invocation {invocationId}?`
- Body: `The invocation will transition to rejected. The Agent harness will receive a rejection result Event. Acting user: {actingUserId}.`
- Buttons: `[Cancel]` `[Reject]`

**States**:

| State                       | Behavior                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Loading                     | Skeleton for both zones.                                                                                              |
| Empty catalog               | `EmptyState`: `No Tools in the catalog. Tools appear when Integrations are installed or built-in Tools are enabled.`  |
| Empty approval queue        | `EmptyState` (inline, not full screen): `No pending approvals. The queue updates when the harness requests approval.` |
| Approve pending             | Approve button `.state-pending`; drawer controls disabled; ConfirmDialog controls disabled.                           |
| Approve success             | `revalidatePath`; cyan confirmation `Invocation {invocationId} approved.`; drawer closes.                             |
| Approve error               | `ErrorAlert` with safe message; drawer stays open.                                                                    |
| Reject pending              | Same pattern as Approve.                                                                                              |
| Reject success              | `revalidatePath`; cyan confirmation `Invocation {invocationId} rejected.`                                             |
| Invocation already terminal | Approve/Reject buttons `.state-disabled` with `aria-disabled="true"` and tooltip `Invocation is already terminal.`    |
| Permission denied           | Approve/Reject hidden; copy: `You do not have permission to approve Tool invocations.`                                |

**Copy slots**: `agents.tools.title`, `agents.tools.zone.catalog`, `agents.tools.zone.queue`, `agents.tools.catalog.empty.*`, `agents.tools.queue.empty.*`, `agents.tools.review.eyebrow`, `agents.tools.review.input`, `agents.tools.review.risk`, `agents.tools.review.actingUser`, `agents.tools.review.result`, `agents.tools.review.action.reject`, `agents.tools.review.action.approve`, `agents.tools.approve.confirm.heading`, `agents.tools.approve.confirm.body`, `agents.tools.approve.success`, `agents.tools.approve.error`, `agents.tools.reject.confirm.heading`, `agents.tools.reject.confirm.body`, `agents.tools.reject.success`, `agents.tools.reject.error`, `agents.tools.error.terminal`, `agents.tools.error.permission`, `agents.tools.error.load`.

**Accessibility**:

- The Approve button is **never** the default focus target when the drawer opens. Initial focus goes to the invocation ID heading so the operator must read the summary before acting. This is an explicit safety control for `[CLIENT-MANAGEMENT-S007]`.
- ConfirmDialog traps focus; Esc maps to Cancel.
- Risk level uses `SignalBadge` with `role="img"` and `aria-label` (e.g. `risk: medium`).
- Input summary is `aria-live="polite"` so screen readers announce it when the drawer opens.

**Browser secrecy notes**:

- Input summary is a **safe projection**. The Server Action must strip any secret-looking fields (tokens, keys) before returning. If the input contains a secret reference, show `[redacted: secret reference]` instead.
- Output ref shows metadata only; never fetches the R2 blob into the browser.

---

### 6.8 `/agents/[agentId]/integrations` — Integration UI (Task 11.8)

**Scenario IDs**: `[CLIENT-MANAGEMENT-S008]`

**Data source**: `listInstallations`, `installIntegration`, `uninstallIntegration`.

**Layout (desktop, list + install form + detail drawer)**:

```
EYEBROW: INTEGRATIONS
H2: Integration installations
agent_id: {agentId}

┌── Action row ────────────────────────────────────────────────────┐
│  [Install Integration]  (toggles install panel)                    │
└───────────────────────────────────────────────────────────────────┘

┌── Install panel (collapsible) ───────────────────────────────────┐
│  FormField: Integration ID (text, required)                         │
│    Helper: Exact integration_id declared by the signed manifest.    │
│            The Agent rejects the install when it does not match.    │
│    Placeholder: intake-integ                                        │
│    Error: "Integration ID is required and must match the manifest   │
│            identity."                                              │
│  FormField: Manifest URL (url, required)                           │
│    Helper: HTTPS URL to the signed Integration manifest. The        │
│            Client sends this as manifest_ref; only the Agent        │
│            Worker fetches and verifies it.                         │
│    Error: "Manifest URL must be a valid https:// URL."             │
│  FormField: Requested grants (textarea/token list, required)        │
│    Helper: One grant per line or comma-separated. Request only      │
│            grants the operator intends to authorize; the Agent      │
│            validates manifest and policy before installing.         │
│    Placeholder: events.publish                                      │
│                 tool.invoke                                        │
│                 delivery.respond                                   │
│    Error: "Add at least one requested grant before installing."    │
│  FormField: Idempotency key (text, optional, auto-generated)       │
│    Helper: Leave blank to generate a one-time key. Reuse a key     │
│            only when retrying the exact same install command.       │
│  [Cancel]  [Install]  (ConfirmDialog: "Install Integration         │
│            {integrationId}? The Agent will fetch the manifest       │
│            server-side, verify signature and identity, and install │
│            only requested grants allowed by policy. Browser will    │
│            not fetch the manifest. Acting user: {actingUserId}.")  │
└───────────────────────────────────────────────────────────────────┘

┌── DataTable: Installations ──────────────────────────────────────┐
│  INSTALLATION ID │ INTEGRATION ID   │ PROVIDER       │ STATUS      │
│  install-001     │ intake-integ     │ intake-provider │ ● active    │
│  install-002     │ review-integ     │ review-provider │ ◑ pending_external_setup │
├───────────────────────────────────────────────────────────────────┤
│  GRANTS                  │ ACTIONS                                          │
│  events.publish, tool.*  │ [View] [Uninstall]                               │
│  events.publish          │ [View] [Complete setup] [Uninstall]              │
└───────────────────────────────────────────────────────────────────┘
```

**Install field contract decision (current Agent RPC)**:

- The install panel binds to the current `InstallIntegrationRequest` contract:
  - `integrationId` ← `Integration ID` field.
  - `manifestRef` ← `Manifest URL` field.
  - `requestedGrants` ← parsed `Requested grants` field.
  - `idempotencyKey` ← supplied idempotency key or generated one-time key.
- The browser-visible UI MUST NOT pass the Manifest URL as `integrationId` and MUST NOT submit an empty `requestedGrants` array.
- The `Manifest digest` pinning input is removed from the install form. The generated request has no `expected_manifest_digest_sha256` (or equivalent) request field, so a digest pinning field would be an unsupported security promise. Do not render digest pinning copy or validation in Client UI until Agent TypeSpec, generated RPC, and Agent domain verification add an explicit expected-digest request field and fail-closed digest comparison behavior.
- `manifest_digest` remains a read-only installation detail only when returned by Agent RPC. It is evidence of the manifest the Agent accepted, not an operator-entered pin.

**Install form parsing and validation**:

- `Integration ID`: trim whitespace; block submit when empty. User-facing validation copy: `Integration ID is required and must match the manifest identity.` Server error copy for identity mismatch: `The manifest identity did not match Integration ID. Enter the exact integration_id declared by the signed manifest.`
- `Manifest URL`: trim whitespace; require `https://`; block browser-side fetch. User-facing validation copy: `Manifest URL must be a valid https:// URL.`
- `Requested grants`: accept one grant per line or comma-separated values; trim each token; discard empty tokens; de-duplicate while preserving first-seen order; block submit when the parsed array is empty. Exact field helper copy: `One grant per line or comma-separated. Request only grants the operator intends to authorize; the Agent validates manifest and policy before installing.` Exact empty-state validation copy: `Add at least one requested grant before installing.`
- `Idempotency key`: trim whitespace; when empty, generate a one-time key immediately before calling the Server Action. The generated key is not shown as a credential and is not persisted in Client D1.
- Client-side validation is an operator affordance only. Agent RPC/domain validation remains the source of truth for manifest identity, signature, policy, and grant acceptance.

**Mobile install layout**:

- The action row stays above the table; the install panel opens full-width below it.
- Fields stack in this order: `Integration ID` → `Manifest URL` → `Requested grants` → `Idempotency key` → action buttons.
- `Requested grants` uses a 7-line textarea on mobile with a parsed grant preview below it: `Requested grants ({count})` followed by compact chips. Chips wrap; no horizontal overflow.
- Buttons use a two-row layout on narrow screens: `[Install]` full-width primary first in DOM after fields, `[Cancel]` full-width secondary below. Keyboard focus order still follows the field order before the primary action.

**DetailDrawer content**:

```
EYEBROW: INSTALLATION DETAIL
installation_id: {installationId}
integration_id: {integrationId}
provider_identity: {providerIdentity}
status: {status}
manifest_digest: {manifestDigest}

GRANTS
  • events.publish
  • tool.invoke
  • delivery.respond

ADAPTER CONNECTIONS
  connection_id: {connectionId}  status: {status}
  [Create Adapter Connection]  (if supported — calls CreateAdapterConnection)
  [Delete Connection]          (per connection)

TOOLS
  • {toolId} — {toolName} ({status})

DELIVERY CAPABILITY
  delivery_enabled: {boolean}
  delivery_contexts: {count}

SETUP INSTRUCTIONS (if pending_external_setup)
  {setupInstructions safe text}

CLEANUP RESULT (if uninstalled)
  ingress rejected: yes
  adapter connections disabled: {count}
  tools disabled: {count}
  pending invocations cancelled: {count}
  schedules cancelled: {count}
  delivery contexts revoked: {count}
  trust keys revoked: yes
  audit event: {auditEventId}

[Uninstall]  (opens ConfirmDialog)
```

**Uninstall ConfirmDialog**:

- Heading: `Uninstall Integration {integrationId}?`
- Body: `The Agent will disable ingress, Adapter Connections, Tools, cancel pending ToolInvocations and Schedules, revoke DeliveryContexts, and revoke trust keys. History is preserved. Acting user: {actingUserId}.`
- Buttons: `[Cancel]` `[Uninstall]`

**States**:

| State                              | Behavior                                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                            | Skeleton list. Install toggle remains visible but disabled with `aria-disabled="true"` until the permission and initial list load complete.                                                                           |
| Empty                              | `EmptyState`: eyebrow `NO INTEGRATIONS`, heading `No Integrations installed.`, lead `Install a signed Integration manifest to add Adapters, Tools, and Delivery capabilities.`, primary action `Install Integration`. |
| Validation: Integration ID missing | Inline field error plus form summary: `Integration ID is required and must match the manifest identity.` Focus moves to `Integration ID` after submit attempt.                                                        |
| Validation: Manifest URL invalid   | Inline field error plus form summary: `Manifest URL must be a valid https:// URL.` No browser fetch occurs.                                                                                                           |
| Validation: requested grants empty | Inline field error plus form summary: `Add at least one requested grant before installing.` The Server Action is not called.                                                                                          |
| Install disabled                   | `[Install]` is disabled while required fields are invalid, while pending, or when permission is denied. Disabled copy uses `aria-describedby` to point to the validation summary or permission copy.                  |
| Install pending                    | Submit `.state-pending`; panel fields disabled; parsed requested-grant chips remain visible as read-only confirmation context.                                                                                        |
| Install success                    | `revalidatePath`; cyan confirmation `Installation {installationId} created.`; panel collapses; form resets to empty values.                                                                                           |
| Install error (manifest fetch)     | `ErrorAlert`: `The Agent could not fetch or verify the manifest. {safe Connect code message}.`                                                                                                                        |
| Install error (identity mismatch)  | `ErrorAlert`: `The manifest identity did not match Integration ID. Enter the exact integration_id declared by the signed manifest.`                                                                                   |
| Install error (grant denied)       | `ErrorAlert`: `The Integration requested grants outside the allowed policy.`                                                                                                                                          |
| Uninstall pending                  | Button `.state-pending`; dialog disabled.                                                                                                                                                                             |
| Uninstall success                  | `revalidatePath`; cyan confirmation `Integration {integrationId} uninstalled.`; drawer shows cleanup result.                                                                                                          |
| Uninstall error                    | `ErrorAlert`; dialog stays open.                                                                                                                                                                                      |
| Pending external setup             | Status badge `◑ pending_external_setup`; `[Complete setup]` action surfaces setup instructions (read-only).                                                                                                           |
| Permission denied                  | Install/Uninstall `.state-disabled`; copy: `You do not have permission to manage Integrations.`                                                                                                                       |

**Copy slots**:

- `agents.integrations.title`: `Integration installations`
- `agents.integrations.action.install`: `Install Integration`
- `agents.integrations.install.field.integrationId.label`: `Integration ID`
- `agents.integrations.install.field.integrationId.helper`: `Exact integration_id declared by the signed manifest. The Agent rejects the install when it does not match.`
- `agents.integrations.install.field.integrationId.placeholder`: `intake-integ`
- `agents.integrations.install.field.integrationId.error.required`: `Integration ID is required and must match the manifest identity.`
- `agents.integrations.install.field.manifestUrl.label`: `Manifest URL`
- `agents.integrations.install.field.manifestUrl.helper`: `HTTPS URL to the signed Integration manifest. The Client sends this as manifest_ref; only the Agent Worker fetches and verifies it.`
- `agents.integrations.install.field.manifestUrl.error.invalid`: `Manifest URL must be a valid https:// URL.`
- `agents.integrations.install.field.requestedGrants.label`: `Requested grants`
- `agents.integrations.install.field.requestedGrants.helper`: `One grant per line or comma-separated. Request only grants the operator intends to authorize; the Agent validates manifest and policy before installing.`
- `agents.integrations.install.field.requestedGrants.placeholder`: `events.publish\ntool.invoke\ndelivery.respond`
- `agents.integrations.install.field.requestedGrants.error.empty`: `Add at least one requested grant before installing.`
- `agents.integrations.install.field.idempotency.label`: `Idempotency key`
- `agents.integrations.install.field.idempotency.helper`: `Leave blank to generate a one-time key. Reuse a key only when retrying the exact same install command.`
- `agents.integrations.install.action.cancel`: `Cancel`
- `agents.integrations.install.action.submit`: `Install`
- `agents.integrations.install.confirm.heading`: `Install Integration {integrationId}?`
- `agents.integrations.install.confirm.body`: `The Agent will fetch the manifest server-side, verify signature and identity, and install only requested grants allowed by policy. Browser will not fetch the manifest. Acting user: {actingUserId}.`
- `agents.integrations.install.confirm.grants`: `Requested grants ({count}): {grantList}`
- `agents.integrations.install.success`: `Installation {installationId} created.`
- `agents.integrations.install.error.fetch`: `The Agent could not fetch or verify the manifest. {safe Connect code message}.`
- `agents.integrations.install.error.identity`: `The manifest identity did not match Integration ID. Enter the exact integration_id declared by the signed manifest.`
- `agents.integrations.install.error.grants`: `The Integration requested grants outside the allowed policy.`
- `agents.integrations.detail.eyebrow`, `agents.integrations.detail.grants`, `agents.integrations.detail.adapters`, `agents.integrations.detail.tools`, `agents.integrations.detail.delivery`, `agents.integrations.detail.setup`, `agents.integrations.detail.cleanup`, `agents.integrations.detail.manifestDigest`
- `agents.integrations.uninstall.action`, `agents.integrations.uninstall.confirm.heading`, `agents.integrations.uninstall.confirm.body`, `agents.integrations.uninstall.success`, `agents.integrations.uninstall.error`, `agents.integrations.empty.*`, `agents.integrations.error.permission`, `agents.integrations.error.load`

The former install copy slot family `agents.integrations.install.field.manifestDigest.*` MUST be removed or left unused. It must not render any digest pinning input under the current Agent RPC contract.

**Accessibility**:

- Install panel uses `aria-expanded` toggle.
- Install form focus order is `Integration ID` → `Manifest URL` → `Requested grants` → `Idempotency key` → `Cancel` → `Install`.
- Validation summary uses `role="alert"`; after a failed submit attempt, focus moves to the first invalid field.
- `Requested grants` textarea uses `aria-describedby` for helper, validation error, and parsed grant preview. The preview is an ordered list of chips with `aria-label="Requested grants preview"`.
- Detail grants list is `<ul>` with `aria-label="Granted scopes"`.
- ConfirmDialog initial focus is the heading; Esc maps to Cancel and returns focus to `[Install Integration]` or the triggering `[Uninstall]` button.
- Cleanup result is `aria-live="polite"` so screen readers announce the cleanup counts after uninstall.
- Uninstall button is disabled when status is `uninstalled` or `failed` (`aria-disabled="true"`).

**Browser secrecy notes**:

- Manifest URL is submitted to the Client Server Action and fetched by the **Agent Worker**, not the browser. The Client browser code never fetches the manifest and never builds Agent RPC transport.
- Provider signing keys are never displayed. `manifest_digest` is shown only as read-only Agent-returned installation metadata, never as an operator-entered pin or enforcement claim.
- Adapter Connection secrets are never displayed; only `connection_id` and `status`.

---

## 7. Shared Interaction and Keyboard Behavior

### 7.1 Focus order

Every route follows: `Topline breadcrumb → SectionNav active tab → Page H2 → AgentToken → primary action / first form field → content`. Modals trap focus and return to the triggering control on close.

### 7.2 Keyboard map

| Key                 | Behavior                                                 |
| ------------------- | -------------------------------------------------------- |
| `Tab` / `Shift+Tab` | Move through focusable elements in DOM order.            |
| `Enter` / `Space`   | Activate buttons, links, toggles.                        |
| `Esc`               | Close DetailDrawer / ConfirmDialog (Cancel semantics).   |
| `?`                 | (Future) Open keyboard help. Not in scope for 11.1-11.8. |

### 7.3 Optimistic / pending feedback

All mutations use `useTransition` (or Server Action form pending state) to show `.state-pending` on the triggering control. No optimistic UI that writes to Client D1 locally — the Server Action is the source of truth and `revalidatePath` refreshes the view.

### 7.4 Error normalization

Agent RPC errors are normalized by `packages/client/src/server/agent-rpc/errors.ts` into safe Connect code messages. The UI never renders raw error objects. The mapping (from memo §30.1):

| Connect code          | User-facing copy template                                     |
| --------------------- | ------------------------------------------------------------- |
| `invalid_argument`    | `The request was invalid: {field hint}.`                      |
| `unauthenticated`     | `Authentication failed. Sign in again.`                       |
| `permission_denied`   | `You do not have permission for this action.`                 |
| `not_found`           | `The requested {resource} was not found.`                     |
| `already_exists`      | `This {resource} already exists.`                             |
| `failed_precondition` | `This action is not allowed in the current state.`            |
| `aborted`             | `A concurrent change occurred. Reload and retry.`             |
| `resource_exhausted`  | `Rate limit reached. Retry in a moment.`                      |
| `unavailable`         | `The Agent is temporarily unavailable. Retrying…`             |
| `deadline_exceeded`   | `The request timed out. Retry.`                               |
| `internal`            | `An internal error occurred. Safe details: {correlation_id}.` |

`{correlation_id}` is safe to expose (it is a request ID, not secret material).

## 8. Accessibility Notes (Cross-Cutting)

- **Language**: `<html lang="ja">` is already set. User-facing copy is English (matching the existing shell) but copy slots are named for future i18n.
- **Color contrast**: `--paper` on dark background meets WCAG AA for body text. `--muted` is reserved for secondary copy >= 0.75rem. `--signal` amber and `--cyan` meet AA for non-text UI components.
- **Motion**: Skeleton pulse is 1.2s ease-in-out; respects `prefers-reduced-motion: reduce` (engineer to add media query that disables pulse and replaces with static `--muted` block).
- **Touch targets**: All buttons >= 44x44 CSS px on mobile.
- **Screen reader announcements**: `role="alert"` for errors, `aria-live="polite"` for success confirmations and pending states, `aria-live="assertive"` for form-level validation summaries.
- **Live regions for async**: When a Server Action completes, the success/error region is `aria-live="polite"` so screen readers announce the outcome without focus moving.
- **Drawer focus trap**: DetailDrawer and ConfirmDialog implement focus trap with `focus-trap` semantics; initial focus is the dialog heading; return focus to the trigger on close.

## 9. Integration Instructions for `unit/client/engineer`

This section tells the engineer which files to change and what to add. It is **not** an instruction for this designer to edit those files.

### 9.1 Design system setup (before route implementation)

Before any route in §9.2 is implemented, the engineer must establish the design system foundation from §4.6-§4.10 and the stack memo:

| Task                        | File(s)                                                                                                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind + PostCSS          | `packages/client/postcss.config.mjs`, `packages/client/app/globals.css` (or co-located `tailwind.css`), `packages/client/tailwind.config.ts` (if v3)                                                                                   | Add Tailwind via PostCSS. Map control-room tokens to shadcn/ui semantic slots per §4.7. Preserve existing `:root` tokens, `.state-*` classes, `@media (prefers-reduced-motion)`, and responsive breakpoints.                                                                                                                                                     |
| shadcn/ui config            | `packages/client/components.json`                                                                                                                                                                                                      | `style: "new-york"`, `rsc: true`, `tsx: true`, `aliases.ui` → `@/components/ui`. Vendor components under `packages/client/src/components/ui/**`.                                                                                                                                                                                                                 |
| Vendor shadcn/ui primitives | `packages/client/src/components/ui/{button,card,table,form,input,textarea,select,badge,alert,skeleton,sheet,alert-dialog,dialog,tabs,navigation-menu,pagination,label,progress,tooltip,separator,scroll-area,toggle-group,sonner}.tsx` | Per §5.1 mapping. Customize to control-room theme via §4.7 tokens. No default light theme, no default blue ring.                                                                                                                                                                                                                                                 |
| TanStack Query provider     | `packages/client/src/components/providers.tsx` (Client Component), mount in `packages/client/app/layout.tsx`                                                                                                                           | `QueryClientProvider` with sensible defaults (`staleTime`, `retry`). No Agent RPC / Drizzle / database module / Prisma imports. Devtools dev-only.                                                                                                                                                                                                               |
| Drizzle schema + D1 adapter | `packages/client/src/server/db/schema.ts`, `packages/client/src/server/db/managed-agents.ts`, `packages/client/src/server/db/access-credentials.ts`                                                                                    | Models `client_managed_agents` + `client_agent_credential_refs` only. `drizzle-orm/d1` bound to `CLIENT_DB` in the server-only repository layer. Preserve `ManagedAgentRepository` / `AccessCredentialRefRepository` interfaces. Reconcile migrations with `wrangler d1 migrations apply`.                                                                       |
| React Compiler              | `packages/client/next.config.ts`                                                                                                                                                                                                       | `reactCompiler: true` + `babel-plugin-react-compiler` dev dependency. Verify `next build` passes.                                                                                                                                                                                                                                                                |
| Form stack                  | `packages/client/src/components/ui/form.tsx` + zod schemas under `packages/client/src/components/schemas/**`                                                                                                                           | `react-hook-form` + `@hookform/resolvers/zod` + `zod`. Zod schemas mirror server-side validation in §6.2/§6.4/§6.6/§6.8 (client affordance only).                                                                                                                                                                                                                |
| Dependencies                | `packages/client/package.json`                                                                                                                                                                                                         | Per the stack memo: `@radix-ui/*`, `tailwindcss`, PostCSS, `@tanstack/react-query`, `drizzle-orm`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `react-hook-form`, `@hookform/resolvers`, `zod`, `sonner`, `babel-plugin-react-compiler` (dev). Must satisfy 72-hour `minimumReleaseAge` + `allowBuilds`; Prisma packages are not used. |

### 9.2 Route files to replace/extend

| File                                                         | Action                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/client/app/agents/page.tsx`                        | Replace `AgentRegistryShell` usage with a Server Component that calls the registry repo + renders `DataTable` per §6.1. |
| `packages/client/app/agents/management-content.tsx`          | Refactor or remove. Shared shell logic moves to `ControlRoomFrame` + `SectionNav` components.                           |
| `packages/client/app/agents/new/page.tsx`                    | Replace with a Client Component form (or Server Component + Client form island) per §6.2.                               |
| `packages/client/app/agents/[agentId]/page.tsx`              | Replace with Server Component calling `getAgentOverview` + `getAgentState` per §6.3.                                    |
| `packages/client/app/agents/[agentId]/settings/page.tsx`     | Replace with settings form per §6.4.                                                                                    |
| `packages/client/app/agents/[agentId]/threads/page.tsx`      | Replace with Thread list + drawer per §6.5.1.                                                                           |
| `packages/client/app/agents/[agentId]/events/page.tsx`       | Replace with Event list per §6.5.2.                                                                                     |
| `packages/client/app/agents/[agentId]/runs/page.tsx`         | **Create** (does not exist). Run list + drawer + cancel per §6.5.3.                                                     |
| `packages/client/app/agents/[agentId]/compactions/page.tsx`  | **Create** (does not exist). Compaction/Memory/History view per §6.5.4.                                                 |
| `packages/client/app/agents/[agentId]/schedules/page.tsx`    | Replace with Schedule list + create panel per §6.6.                                                                     |
| `packages/client/app/agents/[agentId]/tools/page.tsx`        | Replace with Tool catalog + approval queue per §6.7.                                                                    |
| `packages/client/app/agents/[agentId]/integrations/page.tsx` | Replace with Integration list + install panel per §6.8.                                                                 |

### 9.3 Server Actions to verify/extend

The following Server Actions already exist in `packages/client/src/server/actions/` and are referenced by this wireframe. The engineer must verify their signatures match the browser-safe types referenced here and add any missing actions. The repository implementation changes from hand-rolled SQL to Drizzle ORM + D1 adapter, but the `ManagedAgentRepository` / `AccessCredentialRefRepository` interfaces and `BrowserSafe*` return types are preserved. Server Actions must not return raw database rows directly — only `BrowserSafe*` types cross the server/browser boundary. Prisma is not used anywhere:

| Action                                                              | File                  | Status             | Notes                                                                          |
| ------------------------------------------------------------------- | --------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `registerManagedAgent`                                              | `managed-agents.ts`   | exists             | Verify `RegisterManagedAgentInput` includes `displayOrder`.                    |
| `markManagedAgentOpened`                                            | `managed-agents.ts`   | exists             | Used by §6.1 row click.                                                        |
| `saveCredentialReference`                                           | `managed-agents.ts`   | exists             | Returns `BrowserSafeCredentialReference`.                                      |
| `setPinned` / `reorder`                                             | `managed-agents.ts`   | **likely missing** | Engineer to add pin toggle + sort order update Server Actions if not present.  |
| `getAgentOverview`                                                  | `agent-lifecycle.ts`  | exists             | Returns `BrowserSafeAgentOverview`.                                            |
| `getAgentConfig`                                                    | `agent-lifecycle.ts`  | exists             |                                                                                |
| `getAgentState`                                                     | `agent-lifecycle.ts`  | exists             |                                                                                |
| `updateAgentConfig`                                                 | `agent-lifecycle.ts`  | exists             | Verify `ActingUserContext` param.                                              |
| `rotateAgentCredential`                                             | `agent-lifecycle.ts`  | exists             | Verify `ActingUserContext` param.                                              |
| `destroyAgent`                                                      | `agent-lifecycle.ts`  | exists             |                                                                                |
| `listThreads` / `getThread`                                         | `agent-queries.ts`    | exists             |                                                                                |
| `listEvents`                                                        | `agent-queries.ts`    | exists             |                                                                                |
| `listRuns` / `getRun` / `cancelRun`                                 | `agent-queries.ts`    | exists             | Verify `cancelRun` takes `ActingUserContext`.                                  |
| `getLatestCompaction` / `getThreadMemory` / `searchThreadHistory`   | `agent-queries.ts`    | exists             |                                                                                |
| `listSchedules` / `createSchedule` / `cancelSchedule`               | `agent-operations.ts` | exists             | Verify `createSchedule` + `cancelSchedule` take `ActingUserContext`.           |
| `listTools` / `listInvocations`                                     | `agent-operations.ts` | exists             |                                                                                |
| `approveInvocation` / `rejectInvocation`                            | `agent-operations.ts` | exists             | Verify `ActingUserContext` param.                                              |
| `listInstallations` / `installIntegration` / `uninstallIntegration` | `agent-operations.ts` | exists             | Verify `installIntegration` + `uninstallIntegration` take `ActingUserContext`. |

#### 9.3.1 Integration install contract mapping for `unit/client/engineer`

Implement §6.8 against the current Agent RPC shape without adding a Client proxy route or browser Agent RPC transport:

| Engineer-owned file                                                                  | Required implementation instruction                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/client/app/agents/[agentId]/integrations/page.tsx`                         | Render the install panel fields exactly as `Integration ID`, `Manifest URL`, `Requested grants`, `Idempotency key`. Do not render a `Manifest digest` input. Keep the page as a management route shell that calls Server Actions; do not import generated Agent RPC descriptors, Connect runtime, Agent runtime source, or server-only Agent RPC factory into browser-visible code.                                                                            |
| `packages/client/src/components/integration-view-mutations.ts`                       | Change the browser draft model to `{ integrationId, manifestUrl, requestedGrants, idempotencyKey }`. Remove `manifestDigest` and any SHA-256 pinning validation from the install draft. Parse `requestedGrants` from newline/comma text into a non-empty, de-duplicated `string[]`. Call the Server Action as `onInstall(agentId, idempotencyKey, integrationId, manifestUrl, requestedGrants)`. Never pass `manifestUrl` as `integrationId`; never pass `[]`. |
| `packages/client/src/server/actions/agent-operations.ts`                             | Keep the existing `installIntegration(agentId, idempotencyKey, integrationId, manifestRef, requestedGrants)` mapping to `clients.integrations.installIntegration({ agentId, idempotencyKey, integrationId, manifestRef, requestedGrants })`. This server-only action is the Agent RPC boundary.                                                                                                                                                                |
| `packages/client/src/server/actions/agent-operation-view-models.ts`                  | Continue to expose `manifestDigest` only as Browser-safe read-only installation metadata when Agent RPC returns `manifestDigestSha256`. Do not treat it as an input or claim digest pinning.                                                                                                                                                                                                                                                                   |
| `packages/client/src/components/schemas/**` or co-located integration form schema(s) | Mirror §6.8 validation: required `integrationId`, valid `https://` `manifestUrl`, non-empty parsed `requestedGrants`, optional generated `idempotencyKey`. Client validation is only an affordance; Agent RPC/domain remains source of truth.                                                                                                                                                                                                                  |
| `packages/client/src/tests/*.test.ts*`                                               | Update Integration UI tests to assert the digest input is absent, `Integration ID` and non-empty `Requested grants` are required, submit calls the Server Action with `integrationId`, `manifestRef`, and `requestedGrants`, and browser-visible modules do not import Agent RPC/server-only modules.                                                                                                                                                          |

If product direction changes to operator-entered digest pinning, stop Client implementation and route a separate Agent contract change first: `packages/agent/src/typespec/src/services/agent-integration.tsp` must add an explicit expected digest request field, generated RPC outputs must be regenerated, and Agent domain manifest verification must compare the expected digest fail-closed before the Client UI may show a digest pinning field.

### 9.4 Components to create

Create under `packages/client/src/components/` (engineer-owned path). The bespoke primitive direction is removed; each wrapper composes shadcn/ui + Radix primitives per §5.1. Suggested file names:

- `ui/**` — vendored shadcn/ui primitives (customized to control-room theme per §4.7).
- `providers.tsx` — TanStack Query `QueryClientProvider` (Client Component).
- `control-room-frame.tsx` — composes `Card`.
- `section-nav.tsx` — composes `NavigationMenu`.
- `agent-token.tsx` — composes `Badge`.
- `signal-badge.tsx` — composes `Badge` + lucide icon.
- `empty-state.tsx` — composes `Card` + `Button`.
- `error-alert.tsx` — composes `Alert` + `Button` (adds `role="alert"`).
- `data-table.tsx` — composes `Table` + responsive card override.
- `detail-drawer.tsx` — composes `Sheet`.
- `confirm-dialog.tsx` — composes `AlertDialog` (+ `Input` for double-confirm).
- `form-field.tsx` — composes shadcn `Form` (react-hook-form) + `Input`/`Textarea`/`Select`.
- `pagination-bar.tsx` — composes `Pagination` + `Select`.
- `filter-bar.tsx` — composes `ToggleGroup` + `Input`.
- `storage-progress.tsx` — composes `Progress`.
- `json-viewer-dialog.tsx` — composes `Dialog` + `ScrollArea` (read-only JSON).
- `copy.ts` — `CopySlotKey` registry (not a component).
- `schemas/**` — zod schemas mirroring server-side validation (client affordance only).

All components must be server-renderable unless they manage client state (per §5.2). Client Components must use `"use client"` and call Server Actions via `useTransition` / `useFormState` / `useFormStatus` / TanStack Query `useMutation`. All components must remain React Compiler-friendly per §4.9.

### 9.5 CSS additions

Add to `packages/client/app/globals.css` (or co-located `tailwind.css`):

- The shadcn/ui semantic slot mapping per §4.7 (Tailwind `@theme inline` for v4, or `tailwind.config.ts` `theme.extend.colors` for v3) mapping `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--border`, `--input`, `--ring`, `--destructive`, `--destructive-foreground`, `--radius*` to the existing control-room CSS variables.
- `--font-display` and `--font-mono` Tailwind font families per §4.7.
- Preserve existing `.state-loading`, `.state-empty`, `.state-error`, `.state-success`, `.state-disabled`, `.state-pending` classes; re-implement them as Tailwind `@layer components` or composite utilities so shadcn/ui variants and the wireframe's state references stay consistent.
- Preserve `@media (prefers-reduced-motion: reduce)` block that disables skeleton pulse.
- Preserve responsive breakpoints for `.section-nav` (horizontal scroll on < 768px) and the `Table` → stacked-card mobile override (preserve existing `data-label` pattern).
- Do not introduce a light theme. `color-scheme: dark` remains the only mode.

### 9.6 Browser secrecy verification (engineer)

The engineer must verify, in component tests and Playwright E2E (task 11.9):

1. No Agent credential secret, private key, raw JWT, or Provider secret appears in rendered HTML, JS bundle, `localStorage`, `sessionStorage`, or network responses. `[CLIENT-MANAGEMENT-S009]`.
2. No `fetch()` call from browser code targets the Agent RPC origin. `[CLIENT-REGISTRY-S003]`.
3. No `/api/client/*` or Agent proxy route exists. `[CLIENT-REGISTRY-S005]`.
4. Server Action return types strip `credentialRef`, `publicFingerprint`, and secret material. `[CLIENT-REGISTRY-S002]`.
5. `ActingUserContext` is passed on every mutation Server Action. `[CLIENT-MANAGEMENT-S004]`, `[CLIENT-MANAGEMENT-S006]`, `[CLIENT-MANAGEMENT-S007]`, `[CLIENT-MANAGEMENT-S008]`.
6. No Client Component or TanStack Query hook imports `@connectrpc/connect`, `@connectrpc/connect-web`, `@bufbuild/protobuf`, `packages/client/src/generated/agent-rpc/**`, or `packages/client/src/server/agent-rpc/**`. `[CLIENT-REGISTRY-S003]`.
7. No Client Component or TanStack Query hook imports `drizzle-orm`, `packages/client/src/server/db/**`, or any Prisma package/path. Drizzle is server-only for Client D1; Prisma is not used anywhere. `[CLIENT-REGISTRY-S002]`.
8. TanStack Query cache (devtools inspection) contains only `BrowserSafe*` payloads; no `credentialRef`, `publicFingerprint`, or secret material. `[CLIENT-REGISTRY-S002]`, `[CLIENT-MANAGEMENT-S009]`.
9. React Compiler build passes (`next build` with `reactCompiler: true`) and the `react-compiler/react-compiler` lint rule is clean. The compiler must not become a secrecy bypass. `[CLIENT-MANAGEMENT-S009]`.
10. Drizzle table definitions model only `client_managed_agents` and `client_agent_credential_refs`; no Agent domain snapshot tables. Prisma is not used anywhere. `[CLIENT-REGISTRY-S004]`.
11. No React Router (`react-router*`, `@tanstack/react-router`) or Vite SPA entry (`vite.config.ts`, `index.html` SPA, Vite `src/main.tsx`) is introduced. `[CLIENT-REGISTRY-S005]` (route boundary).

## 10. Open Questions and Assumptions

### Assumptions

1. The existing dark "control-room" aesthetic in `globals.css` is the intended design direction; this wireframe extends it rather than replacing it.
2. The existing Server Actions in `packages/client/src/server/actions/` are the contract the UI binds to; if their signatures change, the wireframe's field mappings need a corresponding update.
3. `ActingUserContext` is available in the request context (e.g. via a cookie or header read server-side) and is not a browser-provided form field. The UI echoes the acting user for confirmation, not collects it.
4. Cursor-based pagination is used for all Agent RPC list responses (memo §7.6 and `pagination.tsp` common type). The `PaginationBar` component uses opaque cursors, not page numbers, for Agent-owned data. Page numbers are only a visual affordance.
5. The `?thread={threadId}` query param on `/events`, `/runs`, `/compactions` is the supported deep-link pattern for filtering by Thread.
6. shadcn/ui (Radix UI + Tailwind CSS) is the mandatory component primitive layer per the stack memo; bespoke UI primitives are out of scope. The engineer vendors and customizes shadcn/ui components to the control-room theme via §4.7.
7. Tailwind CSS is the styling layer; the existing `globals.css` control-room tokens are preserved as CSS variables and exposed to Tailwind as shadcn/ui semantic slots. No light theme is introduced.
8. TanStack Query is the browser-safe Server Action cache; it is not a browser Agent RPC transport and never imports Agent RPC / Drizzle / database modules.
9. Drizzle ORM + `drizzle-orm/d1` is the Client D1 repository layer; Agent domain entities are never modeled in Client D1.
10. React Compiler is enabled for `packages/client`; components must remain compiler-friendly per §4.9. The compiler does not change the secrecy boundary.
11. React Router and Vite SPA are not applicable per the stack memo; Next.js App Router owns routing.
12. `react-hook-form` + `@hookform/resolvers/zod` + `zod` drive form validation per the stack memo; zod schemas are client-side affordances that mirror server-side rules, with the Server Action as source of truth.

### Open questions

1. **Acting user source**: Where does `ActingUserContext` come from in the current Client auth flow? The wireframe assumes it is read server-side from the session. If the Client has no auth session yet, the engineer should stub `actingUserId: "unknown-operator"` and surface a TODO — but must not block the UI from rendering.
2. **`setPinned` / `reorder` Server Actions**: The wireframe assumes pin toggle and sort order updates are available. If `managed-agents.ts` does not expose them, the engineer should add them (they are Client D1-only operations, no Agent RPC). This is consistent with `[CLIENT-REGISTRY-S001]` which requires pin/sort/rename/last-opened persistence.
3. **Config JSON editor**: Is a full code editor (e.g. Monaco) in scope, or is a `<textarea>` with JSON validation sufficient? The wireframe assumes `<textarea>` to avoid new heavy dependencies and supply-chain review. A richer editor can be a follow-up change.
4. **R2 blob viewing**: The wireframe shows R2 reference metadata only (digest, size) and never fetches the blob into the browser. If operators need full blob viewing, that should be a separate change with a server-side streaming endpoint that respects secrecy boundaries.
5. **i18n**: Copy slots are named for future i18n, but the initial implementation ships English copy matching the existing shell. Japanese copy is a follow-up.
6. **shadcn/ui style preset**: "new-york" vs "default" — the wireframe assumes "new-york" (smaller, denser) to match the control-room aesthetic. The engineer may choose "default" if it fits better, but must customize to the control-room tokens either way per §4.7.
7. **TanStack Query devtools**: include `@tanstack/react-query-devtools` in dev only? Recommended for debugging the browser-safe cache; must not ship to production.
8. **Drizzle migrations vs existing D1 migrations**: `drizzle-kit` can generate SQL migrations, but it is not part of this baseline. The existing `wrangler d1 migrations apply` flow is the deploy path. The engineer must keep the `db:migrate:local` / `db:migrate:remote` script contract unless a future reviewed tooling task adds Drizzle migration generation.
9. **Tailwind version**: v3 (`tailwind.config.ts`) vs v4 (`@theme inline` in `globals.css`). The stack memo does not pin a version. The engineer should follow the shadcn/ui preset's recommended mechanism; the §4.7 token mapping is version-agnostic.

## 11. Scenario ID Coverage Map

| Scenario ID                | Wireframe section                                                                               | Task       |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| `[CLIENT-MANAGEMENT-S001]` | §6.1 Agent list                                                                                 | 11.1       |
| `[CLIENT-MANAGEMENT-S002]` | §6.2 Add/Edit form                                                                              | 11.2       |
| `[CLIENT-MANAGEMENT-S003]` | §6.3 Overview                                                                                   | 11.3       |
| `[CLIENT-MANAGEMENT-S004]` | §6.4 Settings                                                                                   | 11.4       |
| `[CLIENT-MANAGEMENT-S005]` | §6.5 Threads/Events/Runs/Compactions                                                            | 11.5       |
| `[CLIENT-MANAGEMENT-S006]` | §6.6 Schedules                                                                                  | 11.6       |
| `[CLIENT-MANAGEMENT-S007]` | §6.7 Tools/Approval                                                                             | 11.7       |
| `[CLIENT-MANAGEMENT-S008]` | §6.8 Integrations                                                                               | 11.8       |
| `[CLIENT-MANAGEMENT-S009]` | §2 Invariants, §4.6-§4.10 design-system boundaries, §7.4 Error normalization, §9.6 Verification | all        |
| `[CLIENT-REGISTRY-S001]`   | §6.1, §6.2 (registry persistence)                                                               | 11.1, 11.2 |
| `[CLIENT-REGISTRY-S002]`   | §6.2, §6.4 (credential reference safety), §4.8 TanStack Query cache, §4.9 Drizzle boundary      | 11.2, 11.4 |
| `[CLIENT-REGISTRY-S003]`   | §2, §4.8 TanStack Query boundaries, §9.6 (server-side Connect client)                           | all        |
| `[CLIENT-REGISTRY-S004]`   | §6.3, §6.5 (no D1 snapshots), §4.9 Drizzle D1 boundary                                          | 11.3, 11.5 |
| `[CLIENT-REGISTRY-S005]`   | §2, §4.10 non-applicable runtimes, §9.6 (no proxy route)                                        | all        |

## 12. Verification

This is a wireframe-only artifact under `openspec/changes/**`. No code, generated files, or `tasks.md` checkboxes were modified. The wireframe itself was verified with `openspec validate implement-agent-service-base --strict` (see Commands). No verification commands were required or run against implementation code.

The engineer should verify implementation against this wireframe using:

- `pnpm test:management-client` (component + Server Action tests), including:
  - TanStack Query hook secrecy tests (no Agent RPC / Drizzle / database imports in Client Components or query hooks) per §9.6 items 6-8.
  - Drizzle schema boundary test (only `client_managed_agents` + `client_agent_credential_refs` modeled; Prisma is not used) per §9.6 item 10.
  - React Compiler build pass + `react-compiler/react-compiler` lint clean per §9.6 item 9.
  - shadcn/ui component theme tests (control-room tokens applied, no default light theme, no default blue ring) per §4.7.
- `pnpm test:e2e` (Playwright flows for §6.1-§6.8, including browser credential non-exposure per `[CLIENT-MANAGEMENT-S009]`).
- `pnpm lint` (OpenSpec validate + scenario coverage + boundary checks, including the new Client Component import boundaries for Agent RPC / Drizzle / database modules).
- `pnpm check:management-client` (TypeScript + build with `reactCompiler: true`).
- Manual secret-non-exposure audit per §9.6.
