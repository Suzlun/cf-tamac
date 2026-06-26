# Management Client UI Redesign — Wireframe Index

> このディレクトリは OpenSpec change `redesign-management-client-ui` の design-only ワイヤーフレーム契約です。
> `unit/client/engineer` はこの契約に従って `packages/client/**` を実装します。wireframes は design-only artifact であり、生成物は触れません。

## 対象とする意図

- 顧客: Cloudflare Workers 上の自律 AI Agent を本番運用する管理者。
- 目的: Agent の登録・選択・監督を迷わず行える、リリース品質の Management Client UI 契約を、レイアウト発明なしに実装可能な粒度で定義する。
- 参考 design は方向性の inspiration のみ。table-heavy な一覧にせず、summary/card-first で再設計する。

## 変更してはならない不変量（全ワイヤーフレーム共通）

以下は各画面仕様の前提であり、いかなる画面でも破ってはなりません。

1. **Browser 秘匿性**: Browser bundle / 描画済み HTML / JS / LocalStorage / SessionStorage / Browser への network 応答に、Agent credential・秘密鍵・生 token・Provider secret を絶対に含めない。
2. **No direct Agent RPC from browser**: Browser 側コードから Agent RPC origin を直接呼ばない。Agent RPC は Client server 側（Server Component / Server Action / server-only module）から生成済み Protobuf RPC client を用いてのみ発生する。
3. **No Agent API proxy route**: `/api/client/*`, `/api/agent*`, Agent REST proxy, 任意の RPC forwarding route を公開しない。Server Action / Server Component は internal UI execution boundary のみ。
4. **Client D1 所有権**: Client D1 は managed Agent records と credential references のみ。Agent-domain snapshot（Event, ThreadMemory, AgentState, Schedule, ToolInvocation, Integration Installation, Compaction bodies）は保存しない。必要な Agent-owned data は毎回 server 側 Agent RPC から取得する。
5. **Protobuf RPC-only Agent surface**: Agent REST/OpenAPI/Orval/JSON DTO surface を追加しない。

## 情報アーキテクチャ（確定 IA）

左サイドバー方式（水平タブ禁止）。サイドバーは2つのセクションで構成します。

```
┌─────────────────────────────────────┐
│ [cf-tamac]              [User menu]  │  Topbar（全画面共通）
├──────────────┬──────────────────────┤
│ SIDEBAR      │ CONTENT              │
│              │                      │
│ ▾ Global     │  (画面本体)           │
│  • Agents    │                      │
│  • Settings  │                      │
│              │                      │
│ ▾ [Agent ▾]  │                      │
│   Overview   │                      │
│   Threads    │                      │
│   Events     │                      │
│   Runs       │                      │
│   Schedules  │                      │
│   Integrations│                     │
│   Settings   │                      │
└──────────────┴──────────────────────┘
```

### Global area（常に表示・cross-Agent はここだけ）

| 画面            | URL         | 役割                                       |
| --------------- | ----------- | ------------------------------------------ |
| Agents          | `/agents`   | 管理対象 Agent 一覧・登録(New Agent)・選択 |
| Global Settings | `/settings` | cross-Agent 設定・認証基盤・表示設定       |

### Selected-Agent area（選択中 Agent のみ。未選択時は hidden/disabled + guidance）

| 画面         | URL                              | 役割                                                      |
| ------------ | -------------------------------- | --------------------------------------------------------- |
| Overview     | `/agents/[agentId]`              | 選択中 Agent の健全性・承認キュー・最近活動サマリ         |
| Threads      | `/agents/[agentId]/threads`      | Thread 一覧＋詳細（Compaction/Memory は詳細内パネル）     |
| Events       | `/agents/[agentId]/events`       | Event ストリーム（ToolInvocation 由来を含む）             |
| Runs         | `/agents/[agentId]/runs`         | Run 一覧＋詳細（Tool 実行・承認フローを含む）             |
| Schedules    | `/agents/[agentId]/schedules`    | Schedule 作成・確認・取消                                 |
| Integrations | `/agents/[agentId]/integrations` | Integration install/list/uninstall（Tool カタログを含む） |
| Settings     | `/agents/[agentId]/settings`     | API・credential・model policy・一般設定                   |

### Agent-scoped detail に配置する項目

- **Agent registration**: `Agents` 画面内のプライマリアクションから同一画面内の登録 panel / dialog を開く。
- **Tools**: Tool カタログ=Integrations／Tool 実行=Runs／ToolInvocation 承認=Overview の承認キュー + Runs 詳細／Tool 設定=Settings。
- **Compactions**: 集約サマリ=Overview／詳細=Threads の Thread 詳細内「Memory & Compaction」パネル。

### ルート正規化

- `/` は server-side で `/agents` へリダイレクトする。
- `/agents/[agentId]` 配下の selected-Agent route は、`[agentId]` が Client D1 の managed Agent record に存在しない場合 `notFound()` とする（Agent-owned データ有無とは分離）。

## shadcn/ui デザインシステム（全画面共通）

全画面は `00-shadcn-full-copy-contract.md` を必須入力とし、公式 shadcn/ui を丸ごとコピーした local source を合成して実装する。

### UI component 原則

- すべての Button / Card / Badge / Form / Dialog / Sheet / Dropdown / Tooltip / Tabs / Table / Skeleton / Alert などの visible primitive は `packages/client/src/components/ui/**` の shadcn/ui component を使う。
- `00-shadcn-full-copy-contract.md` に従い、公式 core、docs-only entries、Blocks、Charts を local source として丸ごとコピーする。domain component で独自に再実装しない。
- Domain component は business data と layout composition だけを担当し、visual primitive を bespoke CSS class で作らない。

### 見た目

- `components.json` の `style: new-york`、`baseColor: neutral`、`cssVariables: true` を正とする。
- shadcn/ui default の simple neutral design を利用する。Control-room palette、radial gradient、glow shadow、custom serif typography、独自 color token は使わない。
- `app/globals.css` は Tailwind directives と shadcn/ui default CSS variables / base layer に限定する。

### レイアウト原則

- shadcn/ui `Card` / `Separator` / `ScrollArea` / `Sheet` / `Tabs` / `Accordion` を使って余白と情報グループを作る。
- 一覧は既定で shadcn `Card` composition。table は shadcn `Table` を detail expansion または高密度比較に限定して使う。
- 全ステータスは shadcn `Badge` + lucide icon + text label の3点セットにする。

### モーション

- 控えめ。状態遷移（loading→success/error）とフィードバックに限定。過剰な装飾アニメは不可。`prefers-reduced-motion` を必ず尊重。

## 状態モデル（共通定義）

各画面は以下の状態を網羅する（詳細・コピーは `11-states-copy-a11y.md` で一元管理）。

- **loading**: skeleton（content shape を保ったプレースホルダ）。spinner 全画面は不可。
- **empty**: アクション可能な empty state（次に行うべきことの提示）。
- **error**: secret-safe。原因と次の一手を提示。生スタックトレース・credential は非表示。
- **permission-denied**: 理由（抽象化）と、必要な権限への導線または連絡先。
- **disabled**: 未選択 Agent 時や権限不足時。理由 tooltip/label 付き。
- **optimistic/pending**: Server Action 実行中。ボタン無効化+pending 表示。
- **selected-agent-required**: selected-Agent area の全画面で、Agent 未選択時の専用 state。

## アクセシビリティ原則（共通）

- フォーカス順序は DOM 順（視覚順序と一致）。skip-to-content リンク必須。
- 全 interactivity は keyboard 到達可能。sidebar は arrow-key ナビゲーション対応（`role="navigation"` + `menubar`/`menuitem`）。
- 色・アイコン単独の情報伝達禁止。
- `aria-current="page"` で現在地を示す。
- 動的更新は `aria-live` で通知（但し secret は流さない）。

## ファイル構成

| ファイル                          | 内容                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `00-shadcn-full-copy-contract.md` | shadcn/ui full copy、copy manifest、CSS 削除契約。          |
| `README.md`                       | 本ファイル。IA・不変量・共通規約。                          |
| `01-navigation-shell.md`          | Topbar + 左サイドバー・responsive・Agent 選択状態マシン。   |
| `02-global-agents.md`             | Agents 一覧・New Agent 登録・選択。                         |
| `03-global-settings.md`           | Global Settings（cross-Agent）。                            |
| `04-agent-overview.md`            | Overview（健全性・承認キュー・最近活動・Compaction 集約）。 |
| `05-threads.md`                   | Threads 一覧＋詳細（Memory & Compaction パネル含む）。      |
| `06-events.md`                    | Events ストリーム（ToolInvocation 由来含む）。              |
| `07-runs.md`                      | Runs 一覧＋詳細（Tool 実行・承認含む）。                    |
| `08-schedules.md`                 | Schedules 作成・確認・取消。                                |
| `09-integrations.md`              | Integrations install/list/uninstall（Tool カタログ含む）。  |
| `10-agent-settings.md`            | API・credential・model policy・一般設定。                   |
| `11-states-copy-a11y.md`          | 状態・コピースロット・アクセシビリティの一元定義。          |

## OpenSpec シナリオ ID 命名（参考）

既存命名（`proposal.md` の Naming 節）に従う。本ワイヤーフレームは design-only であり、delta spec のシナリオ ID 採番は別フェーズで行う。ワイヤーフレーム内では既存 ID を参照し、新規必要箇所は「(要 新規シナリオ候補)」と明示する。
