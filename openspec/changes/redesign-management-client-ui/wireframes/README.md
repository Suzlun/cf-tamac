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

### トップレベルから除外する項目（制約準拠）

- **New Agent**: 独立サイドバー項目・独立 screen・独立 route にしない。`Agents` 画面内のプライマリアクションから同一画面内の登録 panel / dialog を開く。
- **Tools**: 独立トップレベルにしない。以下へ分散: Tool カタログ=Integrations／Tool 実行=Runs／ToolInvocation 承認=Overview の承認キュー + Runs 詳細／Tool 設定=Settings。
- **Compactions**: 独立トップレベルにしない。集約サマリ=Overview／詳細=Threads の Thread 詳細内「Memory & Compaction」パネル。

### ルート正規化

- `/` は server-side で `/agents` へリダイレクトする。
- `/agents/[agentId]` 配下の selected-Agent route は、`[agentId]` が Client D1 の managed Agent record に存在しない場合 `notFound()` とする（Agent-owned データ有無とは分離）。

## 美的方向・デザインシステム（全画面共通）

「Operational Console」を方向性とする。遊心ではなく、運用者が長時間迷わず使える高精細・高信頼のコンソール美。generic な AI UI（紫グラデ+Inter+真っ白カード羅列）を明確に回避する。

### タイポグラフィ

- 本文・UI: ヒューマニストサンス（推奨: IBM Plex Sans）。Inter / Roboto / Arial / system-ui の既定使用は禁止。
- 構造化値（Agent ID, Thread key, Timestamp, policy ref, digest）: 等幅（推奨: IBM Plex Mono）。構造化値は常に等幅で「データであること」を視覚化する。
- 見出し: 本文ファミリーの太字 + tracking 調整。装飾ディスプレイフォントは使わない。
- 日本語: 本文ファミリーの CJK ウェイト（または Noto Sans JP の同士）でフォールバック。

### 色

- ベース: neutral graphite/zinc（light: 背景 `#FBFBFA` 系、surface `#FFFFFF` 系。dark: 背景 `#0E0F11` 系、surface `#17181B` 系）。
- アクセント: 選択中 Agent コンテキストと主要 action に使う単一アクセント（推奨: deep teal `#0E7C7B` 系、または operational blue）。紫グラデ・虹色は禁止。
- ステータス意味色: success(緑)/warning(amber)/danger(赤)/info(blue)。**色単独では伝えない**。必ずアイコン+テキストラベルを併用（accessibility）。
- selected-Agent area はアクセントの淡い tint で「今この Agent を見ている」ことを示す。

### レイアウト原則

- 8px spacing grid。
- summary/card-first。一覧は既定で card/tile。table は「詳細を展開した時」や「高密度比較が真に必要な時」のみ。
- 高密度でも余白を殺さない。情報グループは card で区切る。
- 全ステータスは「アイコン+色+ラベル」の3点セット。

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

| ファイル                 | 内容                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `README.md`              | 本ファイル。IA・不変量・共通規約。                          |
| `01-navigation-shell.md` | Topbar + 左サイドバー・responsive・Agent 選択状態マシン。   |
| `02-global-agents.md`    | Agents 一覧・New Agent 登録・選択。                         |
| `03-global-settings.md`  | Global Settings（cross-Agent）。                            |
| `04-agent-overview.md`   | Overview（健全性・承認キュー・最近活動・Compaction 集約）。 |
| `05-threads.md`          | Threads 一覧＋詳細（Memory & Compaction パネル含む）。      |
| `06-events.md`           | Events ストリーム（ToolInvocation 由来含む）。              |
| `07-runs.md`             | Runs 一覧＋詳細（Tool 実行・承認含む）。                    |
| `08-schedules.md`        | Schedules 作成・確認・取消。                                |
| `09-integrations.md`     | Integrations install/list/uninstall（Tool カタログ含む）。  |
| `10-agent-settings.md`   | API・credential・model policy・一般設定。                   |
| `11-states-copy-a11y.md` | 状態・コピースロット・アクセシビリティの一元定義。          |

## OpenSpec シナリオ ID 命名（参考）

既存命名（`proposal.md` の Naming 節）に従う。本ワイヤーフレームは design-only であり、delta spec のシナリオ ID 採番は別フェーズで行う。ワイヤーフレーム内では既存 ID を参照し、新規必要箇所は「(要 新規シナリオ候補)」と明示する。
