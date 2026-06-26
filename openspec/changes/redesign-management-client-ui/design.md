## 範囲

### 対象

- `management-client-shell` の `MANAGEMENT-CLIENT-SHELL-S001`、`MANAGEMENT-CLIENT-SHELL-S002`、`MANAGEMENT-CLIENT-SHELL-S009`、`MANAGEMENT-CLIENT-SHELL-S010` に対応する、左サイドバー型の全体 / 選択中 Agent navigation shell、ブラウザ秘匿、no-proxy 境界の再設計。
- `agent-management-ui` の `AGENT-MANAGEMENT-UI-S010` から `AGENT-MANAGEMENT-UI-S014` に対応する、Agents 画面、Global Settings、Agent 文脈の Overview / Threads / Events / Runs / Schedules / Integrations / Settings のカード・要約優先 UI と状態設計。
- Agent registration を `/agents` 画面内 action として扱う設計。
- `Tools` と `Compactions` に相当する情報を Runs、Events、Threads、Overview、Integrations、Settings の Agent 文脈 detail / metadata として表示する設計。
- desktop / mobile の responsive shell、loading / empty / error / permission-denied / disabled / selected-agent-required / optimistic 状態、keyboard 操作、focus 管理、secret-safe copy。
- 公式 shadcn/ui core、docs-only entries、Blocks、Charts を丸ごと local source としてコピーし、その copy manifest を実装前に生成する design-system reset。
- `app/globals.css` と `tailwind.config.ts` から control-room 独自 CSS、custom palette、gradient/glow、bespoke typography を削除し、shadcn/ui default simple neutral design を使う CSS reset。

### 対象外

- Agent TypeSpec、proto、generated RPC、Agent Worker runtime、Durable Object、Agent storage、Agent binding、Agent governance script の変更。今回の UI redesign は Agent public API 変更を提案しない。
- Agent REST、OpenAPI、Orval、ad-hoc JSON DTO、public Durable Object fetch、Client Agent API proxy route、Browser direct Agent RPC の追加。
- Client D1 に Agent-domain snapshot を保存する設計。Thread、Event、Run、Schedule、ToolInvocation、Integration Installation、Compaction body、raw observability log は Client D1 に保存しない。
- Global Settings のための新しい Client D1 table 追加。Client-wide settings はこの変更では browser-safe な runtime/config 表示、UI preference、既存 management ledger の表示設定に限定し、新規 D1 migration は行わない。
- shadcn/ui 以外の新しい design system、brand palette、custom component framework、独自 CSS animation system の追加。

## 前提と依存

- `proposal.md` は `management-client-shell` と `agent-management-ui` を変更対象仕様単位として指定しており、delta specs はこの 2 unit に限定する。
- `packages/client` は Cloudflare Workers 上の Next.js App Router Management Client であり、ブラウザ可視 modules は Agent credential、Connect runtime、server-only Agent RPC factory、Client D1 seam を import しない。
- Agent-owned data は Client サーバー側 generated Agent RPC client から取得する。Agent Worker は Connect unary binary Protobuf のまま維持する。
- Agent selection は `Agents` 画面の責務とする。Topbar は選択中 Agent の表示 chip と `/agents` への導線だけを持ち、cross-Agent quick switcher は持たない。
- `/` は server-side で `/agents` へ redirect する。`Global Settings` は `/settings` とする。
- `wireframes/*.md` は design-only の詳細画面契約であり、HTML wireframe は未生成である。
- `packages/client/components.json` は `style: new-york`、`baseColor: neutral`、`cssVariables: true` であり、この設定を default shadcn design の正とする。
- `wireframes/00-shadcn-full-copy-contract.md` は official core registry 56 items、docs-only entries、official Blocks、official Charts を丸ごと local source としてコピーし、Registry Directory は third-party 候補として分離記録する契約である。dependency 追加が必要な item は実装時に ask-first で扱う。

## 影響範囲

- `openspec/changes/redesign-management-client-ui/**`: proposal 済み artifact、delta spec、design、tasks、Markdown wireframes。
- `packages/client/app/**`: root redirect、root layout shell、`/agents`、Agent-scoped routes、`/settings`、Agent registration flow、Tool / Compaction detail placement。
- `packages/client/src/components/**`: horizontal `SectionNav` / `ControlRoomFrame` 依存を左サイドバー shell と card / summary components へ置換する。
- `packages/client/src/components/ui/**`, `packages/client/src/components/shadcn-blocks/**`, `packages/client/src/components/shadcn-charts/**`: official shadcn/ui full copy を保持し、domain components がそれらを合成する構造へ統一する。
- `packages/client/app/globals.css` と `packages/client/tailwind.config.ts`: shadcn/ui default CSS variables / neutral semantic tokens へ戻し、control-room custom CSS を削除する。
- `packages/client/src/server/**`: existing Client D1 repositories、Server Actions、server-only Agent RPC factory を維持し、browser-safe navigation props と selection action を server-side に閉じる。
- `packages/client/src/tests/**`: navigation labels、browser secrecy、Client D1 boundary、component states、Scenario ID coverage を更新する。
- Security / operations: Browser secrecy、no-proxy、secret-safe error、generated output 手編集禁止、codegen drift なしを受け入れ条件に含める。

## ディレクトリ構成

```text
openspec/changes/redesign-management-client-ui
├─ design.md
├─ tasks.md
├─ specs
│  ├─ management-client-shell
│  │  └─ spec.md
│  └─ agent-management-ui
│     └─ spec.md
└─ wireframes
   ├─ 00-shadcn-full-copy-contract.md
   ├─ README.md
   ├─ 01-navigation-shell.md
   ├─ 02-global-agents.md
   ├─ 03-global-settings.md
   ├─ 04-agent-overview.md
   ├─ 05-threads.md
   ├─ 06-events.md
   ├─ 07-runs.md
   ├─ 08-schedules.md
   ├─ 09-integrations.md
   ├─ 10-agent-settings.md
   └─ 11-states-copy-a11y.md
packages/client
├─ app
│  ├─ layout.tsx
│  ├─ page.tsx
│  ├─ settings
│  │  └─ page.tsx
│  └─ agents
│     ├─ page.tsx
│     ├─ new
│     │  └─ page.tsx
│     └─ [agentId]
│        ├─ layout.tsx
│        ├─ page.tsx
│        ├─ threads
│        │  └─ page.tsx
│        ├─ events
│        │  └─ page.tsx
│        ├─ runs
│        │  └─ page.tsx
│        ├─ compactions
│        │  └─ page.tsx
│        ├─ tools
│        │  └─ page.tsx
│        ├─ schedules
│        │  └─ page.tsx
│        ├─ integrations
│        │  └─ page.tsx
│        └─ settings
│           └─ page.tsx
├─ src
│  ├─ components
│  │  ├─ ui
│  │  │  ├─ shadcn-registry-copy.generated.json
│  │  │  └─ ... 公式 core registry files を全量コピー
│  │  ├─ shadcn-blocks
│  │  │  └─ ... 公式 block files を route ではない source として全量コピー
│  │  ├─ shadcn-charts
│  │  │  └─ ... 公式 chart files を route ではない source として全量コピー
│  │  ├─ management-shell.tsx
│  │  ├─ sidebar-navigation.tsx
│  │  ├─ agent-card.tsx
│  │  ├─ agent-list.tsx
│  │  ├─ control-room-frame.tsx
│  │  ├─ section-nav.tsx
│  │  ├─ tool-view.tsx
│  │  └─ compaction-view.tsx
│  ├─ server
│  │  └─ actions
│  │     └─ managed-agents.ts
│  └─ tests
│     ├─ browser-agent-rpc-secrecy.test.ts
│     ├─ client-api-proxy-absence.test.ts
│     ├─ client-d1-schema.test.ts
│     ├─ client-repository-boundary.test.ts
│     └─ management-navigation.test.tsx
```

## 新規・変更ファイル

| 種別   | ファイル                                                                                    | 変更内容                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Add    | `openspec/changes/redesign-management-client-ui/design.md`                                  | 本設計を記録し、実装 phase の境界と検証方針を固定する。                                                          |
| Add    | `openspec/changes/redesign-management-client-ui/specs/management-client-shell/spec.md`      | shell、browser secrecy、no-proxy の delta requirements を追加する。                                              |
| Add    | `openspec/changes/redesign-management-client-ui/specs/agent-management-ui/spec.md`          | Agents、Global Settings、Agent 文脈画面、Tools/Compactions 統合、状態/a11y の delta requirements を追加する。    |
| Add    | `openspec/changes/redesign-management-client-ui/tasks.md`                                   | Scenario ID と test task を対応させた実装 checklist を定義する。                                                 |
| Add    | `openspec/changes/redesign-management-client-ui/wireframes/*.md`                            | UI/UX の詳細 wireframe、copy、states、accessibility、security boundary を Markdown で定義する。                  |
| Add    | `openspec/changes/redesign-management-client-ui/wireframes/00-shadcn-full-copy-contract.md` | shadcn/ui 全コピー、copy manifest、CSS reset contract を定義する。                                               |
| Update | `packages/client/app/globals.css`                                                           | Tailwind directives と shadcn/ui default CSS variables / base layer だけに縮小し、custom visual CSS を削除する。 |
| Update | `packages/client/tailwind.config.ts`                                                        | shadcn/ui default semantic tokens を維持し、control-room custom token aliases と custom typography を削除する。  |
| Add    | `packages/client/src/components/ui/**`                                                      | 公式 core `registry:ui` files 56 件を丸ごとコピーし、`index.ts` から export する。                               |
| Add    | `packages/client/src/components/shadcn-blocks/**`                                           | 公式 Blocks を public route ではない local source として丸ごとコピーする。                                       |
| Add    | `packages/client/src/components/shadcn-charts/**`                                           | 公式 Charts を local source として丸ごとコピーする。                                                             |
| Add    | `packages/client/src/components/ui/shadcn-registry-copy.generated.json`                     | 公式 core/docs/block/chart copy status と third-party registry directory separation を記録する。                 |
| Update | `packages/client/app/layout.tsx`                                                            | root layout に `ManagementShell` を組み込み、global navigation と main landmark を提供する。                     |
| Update | `packages/client/app/page.tsx`                                                              | hero / landing を削除し、`/agents` へ server-side redirect する。                                                |
| Add    | `packages/client/app/settings/page.tsx`                                                     | Global Settings を Client-wide settings screen として追加し、Agent-owned data を扱わない。                       |
| Update | `packages/client/app/agents/page.tsx`                                                       | Agents 一覧をカード・要約優先にし、Agent registration と selection を同一画面内 action に統合する。              |
| Delete | `packages/client/app/agents/new/page.tsx`                                                   | registration flow を `/agents` 画面内 panel / dialog に統合するため、分散した登録 page を整理する。              |
| Add    | `packages/client/app/agents/[agentId]/layout.tsx`                                           | registered Agent の存在確認と selected-Agent navigation の server-rendered boundary を提供する。                 |
| Update | `packages/client/app/agents/[agentId]/page.tsx`                                             | Overview をカード・要約優先にし、Tool approval queue と Compaction summary を内包する。                          |
| Update | `packages/client/app/agents/[agentId]/threads/page.tsx`                                     | Thread 詳細に Memory / Compaction metadata panel を統合する。                                                    |
| Update | `packages/client/app/agents/[agentId]/events/page.tsx`                                      | Events を timeline/card-first にし、ToolInvocation 由来 Event を detail metadata として扱う。                    |
| Update | `packages/client/app/agents/[agentId]/runs/page.tsx`                                        | Runs 詳細に Tool execution / approval information を統合する。                                                   |
| Delete | `packages/client/app/agents/[agentId]/tools/page.tsx`                                       | Tool 情報を Runs / Integrations / Overview / Settings の Agent-scoped detail に役割別統合する。                  |
| Delete | `packages/client/app/agents/[agentId]/compactions/page.tsx`                                 | Compaction 情報を Overview / Threads metadata として統合する。                                                   |
| Update | `packages/client/app/agents/[agentId]/schedules/page.tsx`                                   | Schedule cards、create/cancel states、overlap policy 表示を wireframe に合わせる。                               |
| Update | `packages/client/app/agents/[agentId]/integrations/page.tsx`                                | Integration cards/detail に Tool catalog を統合する。                                                            |
| Update | `packages/client/app/agents/[agentId]/settings/page.tsx`                                    | API、credential、model policy、safe settings を Agent-scoped に整理する。                                        |
| Add    | `packages/client/src/components/management-shell.tsx`                                       | Topbar、left sidebar、main landmark、skip link を含む browser-safe shell を提供する。                            |
| Add    | `packages/client/src/components/sidebar-navigation.tsx`                                     | Global / selected-Agent navigation と disabled/selected states を描画する。                                      |
| Add    | `packages/client/src/components/agent-card.tsx`                                             | Agents 一覧の card-first 表示単位を提供する。                                                                    |
| Update | `packages/client/src/components/agent-list.tsx`                                             | table/list 主体から card grid と empty/search/filter states へ再構成する。                                       |
| Update | `packages/client/src/components/control-room-frame.tsx`                                     | horizontal frame 依存を廃止し、必要な shared layout utilities だけへ縮小または削除する。                         |
| Delete | `packages/client/src/components/section-nav.tsx`                                            | horizontal tabs navigation を廃止する。                                                                          |
| Update | `packages/client/src/components/tool-view.tsx`                                              | Tools top-level ではなく Runs / Integrations detail 内 component として再利用する。                              |
| Update | `packages/client/src/components/compaction-view.tsx`                                        | Compactions top-level ではなく Overview / Threads detail metadata として再利用する。                             |
| Update | `packages/client/src/server/actions/managed-agents.ts`                                      | Agent selection、last-opened update、registration Server Action を browser-safe に集約する。                     |
| Update | `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts`                               | 新 shell / sidebar / card components が Agent RPC seam を含まないことを Scenario ID 付きで検証する。             |
| Update | `packages/client/src/tests/client-api-proxy-absence.test.ts`                                | Client が public Agent API proxy を公開しない enduring security boundary を検証する。                            |
| Update | `packages/client/src/tests/management-navigation.test.tsx`                                  | left sidebar、Agent 未選択 disabled state、Global/selected-Agent navigation labels を検証する。                  |
| Update | `packages/client/src/tests/client-d1-schema.test.ts`                                        | 新 UI が Client D1 に Agent-domain snapshot table を追加しないことを回帰検証する。                               |
| Update | `packages/client/src/tests/client-repository-boundary.test.ts`                              | Agent-owned data を Client D1 repository が保存しないことを回帰検証する。                                        |

## システム図

```mermaid
flowchart LR
  Admin[管理者 Browser] -->|ページ表示と Server Action| ClientUI[packages/client App Router]
  ClientUI -->|管理台帳と credential 参照 metadata| ClientDB[(CLIENT_DB)]
  ClientUI -->|server-only generated RPC / binary Protobuf| AgentRPC[packages/agent Connect RPC]
  AgentRPC -->|agent_id scoped DO RPC| AIAgent[AIAgent Durable Object]
  AIAgent -->|Thread/Event/Run/Schedule/Tool/Integration/Compaction 正本| AgentStore[(DO SQLite / Agent-owned storage)]
  Admin -. 禁止 .-> AgentRPC
  ClientUI -. 禁止: Agent proxy route .-> Admin
```

## Package 図

```mermaid
flowchart TB
  App[packages/client/app Server Components] --> Shell[packages/client/src/components ManagementShell]
  App --> Actions[packages/client/src/server/actions]
  Actions --> Repos[packages/client/src/server/db repositories]
  Actions --> RpcFactory[packages/client/src/server/agent-rpc server-only]
  RpcFactory --> Generated[packages/client/src/generated/agent-rpc]
  RpcFactory --> Agent[packages/agent Connect RPC]
  Shell -. browser-safe props only .-> App
  Shell -. 禁止: Agent RPC import .-> Generated
```

## シーケンス図

```mermaid
sequenceDiagram
  participant U as 管理者
  participant A as Agents画面
  participant SA as Server Action
  participant DB as CLIENT_DB
  participant R as server-only Agent RPC
  participant G as Agent Service

  U->>A: /agents を開く
  A->>DB: managed Agent records と credential hint を読む
  DB-->>A: browser-safe metadata
  A-->>U: card-first Agents 画面
  U->>A: エージェントを追加 panel を送信
  A->>SA: 登録 Server Action
  SA->>DB: credential reference と display metadata を検証
  SA->>R: generated RPC client を server-only で生成
  R->>G: InitializeAgent / policy validation を binary Protobuf で呼ぶ
  G-->>R: Agent 初期化結果
  SA->>DB: managed Agent record と last-opened metadata を更新
  SA-->>A: safe action result
  A-->>U: /agents/[agentId] Overview へ遷移
```

## UI ワイヤーフレーム

N/A。`wireframe` skill による `{name}.wireframe.html` は未生成。代替として、design-only Markdown wireframe は `wireframes/*.md` に作成済みであり、本設計と tasks はそれらを実装時の UI/UX contract として参照する。

## ドメインモデル図

```mermaid
classDiagram
  class ManagedAgentRecord {
    +agent_id: string
    +display_name: string
    +agent_rpc_origin: string
    +pinned: boolean
    +sort_order: number
    +last_opened_at: number
  }
  class CredentialReference {
    +agent_id: string
    +credential_ref: string
    +key_id: string
    +masked_hint: string
    +status: string
  }
  class AgentOwnedData {
    +threads
    +events
    +runs
    +schedules
    +toolInvocations
    +integrations
    +compactions
  }
  ManagedAgentRecord "1" --> "0..1" CredentialReference : Client D1 metadata
  ManagedAgentRecord "1" ..> AgentOwnedData : server-only Agent RPC で参照
```

## ER 図

```mermaid
erDiagram
  CLIENT_MANAGED_AGENTS ||--o| CLIENT_AGENT_CREDENTIAL_REFS : "agent_id"
  CLIENT_MANAGED_AGENTS {
    string agent_id
    string agent_rpc_origin
    string display_name
    int pinned
    int sort_order
    int created_at
    int updated_at
    int last_opened_at
  }
  CLIENT_AGENT_CREDENTIAL_REFS {
    string agent_id
    string credential_ref
    string key_id
    string masked_hint
    string status
    int created_at
    int updated_at
  }
```

新しい Client D1 table は追加しない。Global Settings は Client-wide 表示設定と runtime/config 状態の画面であり、Agent-domain snapshot や secret を保存しない。

## Package レベル設計

### Package 一覧

| Package                          | 目的 / 責務                                                                                     | Public API                                    | 依存                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `packages/client/app`            | App Router routes、Server Components、route layout、redirect、selected-Agent shell を所有する。 | `/agents`, `/settings`, `/agents/[agentId]/*` | `packages/client/src/components`, `src/server/actions` |
| `packages/client/src/components` | browser-safe UI components、card / summary views、navigation shell、states を所有する。         | React components                              | browser-safe props のみ                                |
| `packages/client/src/server`     | Server Actions、Client D1 repositories、server-only Agent RPC factory を所有する。              | Server Actions / server-only modules          | `CLIENT_DB`, generated Agent RPC client                |
| `packages/client/src/tests`      | Scenario ID 付きの route、navigation、boundary、component state tests を所有する。              | Vitest / component tests                      | `packages/client/app`, `src/components`, `src/server`  |
| `packages/agent`                 | Agent-owned data と Protobuf RPC-only public API を所有し、今回変更しない。                     | Connect unary binary Protobuf RPC             | Durable Object / Agent-owned storage                   |

### Details

#### `packages/client/app`

- Purpose / Responsibility: route shell と server-rendered boundary を所有する。global route は `/agents` と `/settings`、selected-Agent route は `/agents/[agentId]` 配下の 7 画面を提供する。
- Public API: Next.js App Router pages と layouts。public Agent API は提供しない。
- Key Data Structures: route params、browser-safe managed Agent display metadata、action result payload。
- Key Flows: `/` redirect → `/agents` card list → Agents 画面内 registration panel → selected-Agent Overview。Agent-scoped routes は `[agentId]` が Client D1 に登録済みか server-side で確認する。
- Dependencies: `src/server/actions` から Client D1 と Agent RPC を server-side に閉じる。Browser-visible route component は server-only modules を直接 import しない。
- Error Handling: not found、permission-denied、RPC error、validation error は secret-safe copy と actionable CTA を表示する。
- Testing Strategy: `MANAGEMENT-CLIENT-SHELL-S001`、`MANAGEMENT-CLIENT-SHELL-S009`、`MANAGEMENT-CLIENT-SHELL-S010`、`AGENT-MANAGEMENT-UI-S010`、`AGENT-MANAGEMENT-UI-S012` を route/navigation/component tests で検証する。
- Non-Functional: left sidebar は keyboard accessible、mobile drawer は focus trap と Esc close を持つ。
- Performance: card skeleton と Server Component streaming を活用し、Agent-owned data は必要画面だけで取得する。
- Security: no `/api/**` Agent proxy、no direct browser RPC、no credential props。

#### `packages/client/src/components/ui`

- Purpose / Responsibility: official shadcn/ui core files の full local copy を所有する。screen-specific component が visual primitive を再実装しないよう、全 Button/Card/Dialog/Sheet/Menu/Form/State 表現をここへ集約する。
- Public API: shadcn/ui components exported from `packages/client/src/components/ui/index.ts`。
- Key Data Structures: component props only。Agent credential、Client D1 seam、Agent RPC client は受け取らない。
- Key Flows: official core registry を全コピーし、screen work は copied local source import へ統一する。
- Dependencies: shadcn/ui generated local source、Radix packages、class-variance-authority、tailwind-merge、lucide-react。新 dependency が必要な component は ask-first。
- Error Handling: component level は表示責務のみ。secret-safe copy は呼び出し側 view model から受ける。
- Testing Strategy: `MANAGEMENT-CLIENT-SHELL-S011` と `AGENT-MANAGEMENT-UI-S019` で required imports と custom CSS removal を検査する。
- Non-Functional: shadcn `new-york` / `neutral` / CSS variables を維持し、custom visual theme を作らない。
- Performance: component は lightweight composition に留める。
- Security: browser-visible component に Agent credential / RPC construction seam を含めない。

#### `packages/client/src/components`

- Purpose / Responsibility: shadcn/ui components を合成した reusable UI shell と screen components を所有し、route-local JSX duplication を避ける。
- Public API: `ManagementShell`, `SidebarNavigation`, `AgentCard`, screen-specific cards / panels。
- Key Data Structures: `NavigationItem`, `AgentDisplaySummary`, `StatusTone`, `SecretSafeErrorViewModel`。
- Key Flows: Server Component から受けた safe props を表示し、client interactivity は sidebar drawer、collapse、modal open/close、pending 表示に限定する。
- Dependencies: React と `packages/client/src/components/ui/**` の shadcn/ui components。`@connectrpc/connect`、generated Agent RPC、server-only modules、`CLIENT_DB` seam は依存禁止。
- Error Handling: `ErrorAlert` と `EmptyState` を再利用し、raw stack や credential を表示しない。
- Testing Strategy: `AGENT-MANAGEMENT-UI-S014` と `MANAGEMENT-CLIENT-SHELL-S002` を component tests と browser secrecy tests で検証する。
- Non-Functional: `skip-to-content`、`aria-current`, `aria-disabled`, `aria-live`, `prefers-reduced-motion` を shadcn/ui component composition で標準化する。
- Performance: shadcn `Card` layout は virtualization ではなく pagination / filtering と `Skeleton` を優先する。大量 Agent は server search に昇格できる構造にする。
- Security: props に secret を含めない。structured values は等幅表示だが token / secret body は渡さない。

#### `packages/client/src/server`

- Purpose / Responsibility: Client D1 ownership、credential reference resolution、server-only Agent RPC invocation、Server Action validation を所有する。
- Public API: `registerManagedAgent`, `selectManagedAgent`, `markManagedAgentOpened`, `setManagedAgentPinned`, Agent screen data query actions。
- Key Data Structures: managed Agent record、credential reference metadata、safe validation result、Agent RPC result sanitizer。
- Key Flows: Browser form → Server Action → server-side validation → Client D1 repository / generated Agent RPC → safe UI result。
- Dependencies: Drizzle D1 repository、`server-only` Agent RPC modules、generated Agent RPC descriptors。Agent runtime source は import しない。
- Error Handling: domain error を user-facing safe message に変換し、internal details は server-side log に限定する。
- Testing Strategy: `AGENT-MANAGEMENT-UI-S010` から `AGENT-MANAGEMENT-UI-S014` と既存 `AGENT-MANAGEMENT-UI-S009/S017/S018` の境界を unit/integration tests で検証する。
- Non-Functional: action idempotency、double submit prevention、pagination、no snapshot persistence を維持する。
- Performance: Agent-owned lists は page size と filter を Agent RPC query に渡し、Client D1 へ cache しない。
- Security: credential ref は server-only で解決し、Browser へ raw credential / token / signing material を返さない。

## 実装計画

```mermaid
flowchart TD
  T1[1. delta specs と Scenario ID を確定] --> T2[2. official shadcn full copy と CSS reset を先に完了]
  T2 --> T3[3. wireframes を実装入力として固定]
  T3 --> T4[4. root shell と left sidebar を shadcn で提供]
  T4 --> T5[5. Agents 画面と登録 panel を shadcn で提供]
  T4 --> T6[6. Agent-scoped routes を7画面へ再構成]
  T6 --> T7[7. Tools/Compactions を detail metadata に統合]
  T5 --> T8[8. browser secrecy / no-proxy / D1 / shadcn CSS boundary tests を更新]
  T7 --> T8
  T8 --> T9[9. lint/test/build/codegen drift で検証]
```

## テスト計画

### 受け入れテスト（手動）

| UAT ID                              | 関連要件                                        | 仕様要約                                                                    | 顧客課題要約                                                           | 手順                                                                               | 期待結果                                                                             |
| ----------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| UAT-MANAGEMENT-CLIENT-SHELL-HAP-001 | MANAGEMENT-CLIENT-SHELL-R009 navigation shell   | global と selected-Agent が左サイドバーで分離される。                       | 管理者が全体画面と Agent 固有画面を混同しない。                        | `/agents` を開き、Agent 未選択、選択済み、mobile 幅で navigation を確認する。      | Global は Agents/Global Settings のみ、selected-Agent は選択時だけ有効になる。       |
| UAT-AGENT-MANAGEMENT-UI-HAP-001     | AGENT-MANAGEMENT-UI-R010 Agents screen          | Agents 画面が card-first で Agent 登録と選択を扱う。                        | 管理者が登録・選択を同じ入口で迷わず行える。                           | 空状態、複数 Agent、検索、`エージェントを追加` panel を確認する。                  | 登録 flow は Agents 画面内 action として動作する。                                   |
| UAT-AGENT-MANAGEMENT-UI-HAP-002     | AGENT-MANAGEMENT-UI-R011 Agent-scoped screens   | Overview/Threads/Events/Runs/Schedules/Integrations/Settings が表示される。 | 管理者が Agent の状態を table-only ではなく要約から把握できる。        | Agent を選択し、7 画面を巡回して card / summary、states、breadcrumbs を確認する。  | 各画面は選択中 Agent の情報だけを表示し、Tool / Compaction 情報は detail 内にある。  |
| UAT-MANAGEMENT-CLIENT-SHELL-SEC-001 | MANAGEMENT-CLIENT-SHELL-R011 browser-safe shell | Browser に Agent credential / direct RPC logic を出さない。                 | 管理 UI が攻撃面や proxy API にならない。                              | DevTools で HTML、bundle、network、storage、route を確認する。                     | Agent credential、Agent RPC direct request、proxy route、raw secret は観測されない。 |
| UAT-MANAGEMENT-CLIENT-SHELL-HAP-002 | MANAGEMENT-CLIENT-SHELL-R012 shadcn shell       | Shell が shadcn/ui default component と simple neutral theme で構成される。 | 独自 CSS による使いにくい UI ではなく、予測可能な shadcn UI にしたい。 | Topbar、Sidebar、mobile drawer、Breadcrumb、Agent chip を確認する。                | shadcn default の Button/Sheet/ScrollArea/Breadcrumb/Avatar 等で構成される。         |
| UAT-AGENT-MANAGEMENT-UI-HAP-003     | AGENT-MANAGEMENT-UI-R019 shadcn screens         | 公式 shadcn/ui が全コピーされ、screen が copied source を使う。             | UI のばらつきと再実装をなくし、保守できる画面群にしたい。              | Agents から各 Agent-scoped screen を巡回し、forms/dialogs/tabs/states を確認する。 | shadcn default の Card/Form/Dialog/Tabs/Alert/Skeleton 等で一貫して表示される。      |

### E2E テスト（Playwright）

| E2E ID                              | Playwright test 名                                                                    | 関連 Scenario                | 区分 | 要約                                                                              | 手順（Playwright）                                                                              | 期待結果                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------- | ---- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| E2E-MANAGEMENT-CLIENT-SHELL-HAP-001 | `[MANAGEMENT-CLIENT-SHELL-S009] 左サイドバーが global と selected-Agent を分離する`   | MANAGEMENT-CLIENT-SHELL-S009 | HAP  | Agent 未選択/選択済みで sidebar 状態を検証する。                                  | `/agents` を開き、Agent 選択前後と mobile drawer を操作する。                                   | Global items は常時表示、selected-Agent items は選択時のみ有効になる。           |
| E2E-MANAGEMENT-CLIENT-SHELL-SEC-001 | `[MANAGEMENT-CLIENT-SHELL-S002] Browser が Agent RPC を直接実行しない`                | MANAGEMENT-CLIENT-SHELL-S002 | SEC  | Browser-visible behavior が server-side Agent RPC boundary を保つことを検証する。 | `/agents` と selected-Agent screens を操作し、network と bundle-observable surface を確認する。 | Agent RPC は Client server 側からのみ発生し、Browser に credential は渡らない。  |
| E2E-AGENT-MANAGEMENT-UI-HAP-001     | `[AGENT-MANAGEMENT-UI-S010] Agents 画面が card-first で登録 action を提供する`        | AGENT-MANAGEMENT-UI-S010     | HAP  | card-first list と登録 panel を検証する。                                         | `/agents` で empty/list/search/registration panel を操作する。                                  | Agent cards と同一画面内登録 flow が表示される。                                 |
| E2E-AGENT-MANAGEMENT-UI-HAP-002     | `[AGENT-MANAGEMENT-UI-S011] selected-Agent screens が7画面で有効になる`               | AGENT-MANAGEMENT-UI-S011     | HAP  | Agent-scoped navigation を検証する。                                              | Agent を開き、Overview/Threads/Events/Runs/Schedules/Integrations/Settings を巡回する。         | すべて選択中 Agent に scope され、Agent 未選択時は guidance が出る。             |
| E2E-AGENT-MANAGEMENT-UI-HAP-003     | `[AGENT-MANAGEMENT-UI-S012] Tools と Compactions が detail metadata として表示される` | AGENT-MANAGEMENT-UI-S012     | HAP  | Tool / Compaction 情報が Agent-scoped context に沿って表示されることを検証する。  | Overview/Threads/Runs/Integrations/Settings を開いて該当 metadata を確認する。                  | Tool / Compaction 情報は選択中 Agent の detail context に表示される。            |
| E2E-MANAGEMENT-CLIENT-SHELL-HAP-002 | `[MANAGEMENT-CLIENT-SHELL-S011] Shell uses shadcn/ui components and default theme`    | MANAGEMENT-CLIENT-SHELL-S011 | HAP  | Shell の copied shadcn source usage と custom CSS removal を検証する。            | `/agents` と mobile viewport を開き、sidebar/drawer/breadcrumb/user menu を確認する。           | shadcn shell components が表示され、custom control-room styling は観測されない。 |

### 結合テスト（Endpoint）

| IT ID                              | Test 名                                                                                 | 種別   | 区分 | 要約                                                              | 手順（Test）                                                                                   | 期待結果                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ------ | ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| IT-MANAGEMENT-CLIENT-SHELL-SEC-001 | `[MANAGEMENT-CLIENT-SHELL-S002] 再設計 shell が Agent RPC seam を Browser に含めない`   | client | SEC  | app/browser-visible source の禁止 import と禁止文字列を検査する。 | `packages/client/app/**` と browser-visible components を静的検査する。                        | generated Agent RPC、Connect runtime、credential headers、server-only factory が存在しない。       |
| IT-MANAGEMENT-CLIENT-SHELL-SEC-002 | `[MANAGEMENT-CLIENT-SHELL-S008] Client は Agent proxy route を公開しない`               | client | SEC  | App Router route handlers と network boundary を検査する。        | route handlers と server action boundary を列挙し、public Agent API proxy surface を検査する。 | public Agent API proxy は公開されず、Agent RPC は server-side module からのみ呼ばれる。            |
| IT-AGENT-MANAGEMENT-UI-BND-001     | `[AGENT-MANAGEMENT-UI-S013] Client D1 は Agent-domain snapshot を保存しない`            | client | BND  | Client D1 schema と repository API を検査する。                   | table names、write APIs、repository exports を列挙する。                                       | managed Agent records と credential refs 以外の Agent-domain snapshot table/API がない。           |
| IT-AGENT-MANAGEMENT-UI-HAP-001     | `[AGENT-MANAGEMENT-UI-S010] Agent selection は Server Action で last-opened を更新する` | client | HAP  | Agent selection の server-side boundary を検証する。              | `selectManagedAgent` action を呼び、Client D1 metadata と safe result を検証する。             | Browser へ credential を返さず、last-opened metadata が更新される。                                |
| IT-AGENT-MANAGEMENT-UI-HAP-002     | `[AGENT-MANAGEMENT-UI-S019] Screens use copied shadcn/ui source without custom CSS`     | client | HAP  | official shadcn/ui full copy と CSS reset を静的検査する。        | copy manifest、`components/ui/**`、`shadcn-blocks/**`、`shadcn-charts/**`、CSS を検査する。    | official core/block/chart source が copied で、custom visual class/token/gradient が残っていない。 |

### Unit/Component テスト（UT）

| UT ID                               | Test 名                                                                                        | Package                        | 区分 | 要約                                                     | 手順（Test）                                                                        | 期待結果                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ | ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| UT-MANAGEMENT-CLIENT-SHELL-A11Y-001 | `[MANAGEMENT-CLIENT-SHELL-S009] SidebarNavigation が keyboard と aria-current を満たす`        | packages/client/src/components | A11Y | sidebar の focus、current、disabled state を検証する。   | component render で nav role、aria-current、aria-disabled、keyboard を検証する。    | 現在地と無効理由が支援技術に伝わる。                                       |
| UT-MANAGEMENT-CLIENT-SHELL-SEC-001  | `[MANAGEMENT-CLIENT-SHELL-S002] ManagementShell props は browser-safe metadata のみを受け取る` | packages/client/src/components | SEC  | shell props に secret-like fields がないことを検証する。 | fixture props と禁止 key/文字列を検査する。                                         | credentialRef value、Authorization、Bearer、Connect factory 名を含まない。 |
| UT-AGENT-MANAGEMENT-UI-HAP-001      | `[AGENT-MANAGEMENT-UI-S010] AgentCard が status を色だけで伝えない`                            | packages/client/src/components | A11Y | card status の icon+label+tone を検証する。              | status variants を render し、label と icon aria を assert する。                   | status は色単独ではなく text label を持つ。                                |
| UT-AGENT-MANAGEMENT-UI-ERR-001      | `[AGENT-MANAGEMENT-UI-S014] secret-safe error が raw stack と token を表示しない`              | packages/client/src/components | ERR  | error component の sanitization を検証する。             | raw stack/token を含む error fixture を渡す。                                       | 表示 copy は抽象化され、raw secret-like content は出ない。                 |
| UT-AGENT-MANAGEMENT-UI-BND-001      | `[AGENT-MANAGEMENT-UI-S012] ToolView と CompactionView は Agent-scoped detail を描画する`      | packages/client/src/components | BND  | detail component としての再利用を検証する。              | Runs/Threads context props で render する。                                         | 選択中 Agent context に沿った Tool / Compaction detail が表示される。      |
| UT-MANAGEMENT-CLIENT-SHELL-HAP-002  | `[MANAGEMENT-CLIENT-SHELL-S011] Shell uses shadcn/ui components and default theme`             | packages/client/src/components | HAP  | Shell が shadcn/ui imports で構成されることを検証する。  | source を静的検査し、Button/Sheet/ScrollArea/Breadcrumb/Avatar 等の使用を確認する。 | shell は custom visual class ではなく shadcn component を使う。            |
| UT-AGENT-MANAGEMENT-UI-HAP-002      | `[AGENT-MANAGEMENT-UI-S019] Screens use copied shadcn/ui source without custom CSS`            | packages/client                | HAP  | copied shadcn source と CSS 削除を検証する。             | copy manifest、component source、CSS を静的検査する。                               | official source が copied で、control-room custom CSS がない。             |

## 差し戻し / 移行

- DB migration は N/A。新しい Client D1 table を追加せず、既存 `client_managed_agents` と `client_agent_credential_refs` を維持する。
- Agent API migration は N/A。TypeSpec、proto、generated RPC、Agent Worker runtime は変更しない。
- route shell に重大問題が見つかった場合は、互換 shim を追加せず change set を revert し、再度 OpenSpec と tests を整合させる。

## リリース手順

- `openspec validate --type change "redesign-management-client-ui" --strict --no-interactive` を通す。
- implementation phase では `pnpm lint`、`pnpm check:client`、`pnpm test:client`、`pnpm build`、`pnpm check:codegen` を通す。
- Browser secrecy と no-proxy route の regression を reviewer が確認する。
- left sidebar、Agents registration action、Tool / Compaction detail placement を UAT で確認する。

## 受け入れ条件

- `MANAGEMENT-CLIENT-SHELL-S001`、`MANAGEMENT-CLIENT-SHELL-S002`、`MANAGEMENT-CLIENT-SHELL-S009`、`MANAGEMENT-CLIENT-SHELL-S010` と `AGENT-MANAGEMENT-UI-S010` から `AGENT-MANAGEMENT-UI-S014` の automated tests が Scenario ID を test title に含んで pass する。
- `MANAGEMENT-CLIENT-SHELL-S011` と `AGENT-MANAGEMENT-UI-S019` の automated tests が公式 shadcn/ui 全コピー、copied source usage、custom CSS removal を検証して pass する。
- 公式 shadcn/ui core registry items、docs-only recipes、Blocks、Charts が local source としてコピーされ、copy manifest で `copyStatus` が確認できる。
- `app/globals.css` は Tailwind directives と shadcn/ui default CSS variables / base layer に限定され、`tailwind.config.ts` は custom control-room token aliases を持たない。
- Global area は `Agents` と `Global Settings` のみ、selected-Agent area は `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` のみになる。
- Agent 未選択時は selected-Agent items が hidden または disabled になり、`Agents` 画面への guidance が表示される。
- Agent registration は Agents 画面内 action として操作でき、Tool / Compaction 情報は Agent-scoped detail context に表示される。
- Browser bundle、HTML、storage、network response に Agent credential、direct Agent RPC invocation logic、Agent proxy route、raw secret が含まれない。
- Agent TypeSpec/proto/generated RPC に差分がないことを `pnpm check:codegen` で確認する。

## 未解決事項

- なし。`/` は `/agents` redirect、Global Settings route は `/settings`、Agent selection と registration は Agents 画面、Global Settings は新 Client D1 table なしで設計する。
