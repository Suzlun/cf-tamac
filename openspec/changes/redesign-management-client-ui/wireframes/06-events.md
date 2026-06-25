# 06 — Selected-Agent: Events（Event ストリーム）

## Intent & Users

- 顧客: 管理者。Agent で発生した Event（ToolInvocation 由来を含む）を時系列で追跡し、「何が起きたか」の因果を確認したい。
- 目的: Event を card/timeline-first で提示。table-heavy を避け、因果 link・provenance を視覚化する。ToolInvocation 由来 Event は Tool 実行の詳細へ導線し、Tools トップレベルを廃止する根拠とする。

## Route & URL

- `GET /agents/[agentId]/events`
- 詳細は page 内で row 展開、または `?event=...`。

## Desktop layout (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ イベント          [🔍][種別▼][状態▼][時間範囲▼][Thread ▼] 並び順 │ │ Toolbar
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ ┌────────────────────────────────────────────────────────────┐ │ │
│ │ │ ● e-9912   TOOL_INVOCATION   success   3分前                │ │ │ EventRow(card)
│ │ │ 種別: web.search   Thread: t-7   因果: ← e-9910, → e-9915   │ │ │
│ │ │ 要約: ...                                                    │ │ │
   │ │ [詳細 ▾]                                                    │ │ │
│ │ └────────────────────────────────────────────────────────────┘ │ │
│ │ ┌────────────────────────────────────────────────────────────┐ │ │
│ │ │ ● e-9910   MODEL_TURN        success   3分前                │ │ │
│ │ │ ...                                                          │ │ │
│ │ └────────────────────────────────────────────────────────────┘ │ │
│ │ [もっと読み込む]（paging）                                       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

- `EventRow` を card 化（既定で table にしない）。1 行 = 1 card。
- 展開（`詳細 ▾`）で: sequence, type, source, 状態, スナップショット要約, 判断出力, 因果 link（前後 Event/Run への deep link）。
- **ToolInvocation 由来 Event** は `TOOL_INVOCATION` 種別で表示し、`該当する実行(Run)の Tool 実行を確認` リンクで Runs 詳細へ導線（Tools 廃止の代替導線）。

## Mobile layout (< 1024px)

- card 縦スタック。toolbar は折りたたみ可能 filter。詳細は push 画面。

## Data & state contract（server-only 境界）

- Event 一覧・詳細は server-side Agent RPC。Agent-domain snapshot を Client D1 非保存（AGENT-MANAGEMENT-UI-S005）。
- paging/filter は `agent_id`（必須）+ Thread/種別/状態/時間範囲を維持。

## States

- **loading**: EventRow skeleton 数件 + toolbar 有効。
- **empty**: `表示できるイベントがありません / フィルタを解除`。
- **error**: secret-safe。`イベントの取得に失敗しました / 再試行`。
- **filter-loading**: 既存リストを維持しつつ上に progress（ちらつき防止）。
- **permission-denied**: `権限がありません`。
- **overflow（件数上限）**: `古いイベントは Agent 側の保持ポリシーに従います。必要に応じて時間範囲を変更してください。`

## Copy slots（日本語）

- h1: `イベント`。filter: `種別`, `状態`, `時間範囲`, `スレッド`, `検索...`, `並び順`。
- row: `因果`, `要約`, `詳細`, `もっと読み込む`。
- 種別ラベル: `ツール実行`(TOOL_INVOCATION), `モデル応答`(MODEL_TURN) 等は Agent 側定義に従い日本語表示。

## Accessibility

- timeline/row は `role="list"`/`listitem`。filter は `role="search"` + labeled。
- 因果 link は文脈ラベル（`原因のイベント e-9910`, `結果のイベント e-9915`）。
- 動的読み込みは `aria-live="polite"` で件数を通知（secret 無し）。

## Integration notes for unit/client/engineer

- `packages/client/app/agents/[agentId]/events/page.tsx`: card/timeline-first へ再設計。server component で Event 一覧 RPC、query で paging/filter。
- ToolInvocation 由来 Event から Runs 詳細（該当 Run/Tool 実行）への deep link を server 側で解決可能にする。

## Open questions / assumptions

- A: Event の「種別」語彙は Agent RPC の enum に従う。UI は表示用日本語ラベルへ map。
- Q: リアルタイム更新（poll/SSE）は本ワイヤーフレームの範囲外。初回は手動 `再取得` + paging を想定（no-proxy 境界を維持しつつ将来拡張可能）。
