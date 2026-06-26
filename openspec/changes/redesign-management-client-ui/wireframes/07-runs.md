# 07 — Selected-Agent: Runs（+ Tool 実行・承認）

## 目的と利用者

- 顧客: 管理者。Agent の Run 単位の実行と、Run 内の Tool 実行・承認を追跡・監督したい。
- 目的: Run 一覧（card-first）＋ Run 詳細。**Tool 実行（ToolInvocation の試行/結果/承認）は Run 詳細内に集約**し、Tools トップレベルを廃止する主要な根拠とする。Overview の承認キューと連動する。

## Route と URL

- `GET /agents/[agentId]/runs`
- 詳細: master-detail または `?run=...`。承認ビュー: `?run=...&focus=approval` 等。

## デスクトップ layout — 一覧 + 詳細 master-detail (>= 1280px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌────────────────────────┬──────────────────────────────────────────┐│
│ │ 実行                    │ Run 詳細: r-1283                          ││
│ │ [🔍][状態▼][承認待ち▼]   │ ┌──────────────────────────────────────┐ ││
│ │ ┌────────────────────┐ │ │ ヘッダ: r-1283 ●success Thread t-7   │ ││
│ │ │ ● r-1283 success   │ │ │ 開始 X前  所要 Ys  model policy p-9  │ ││
│ │ │ Thread t-7  2分前   │ │ ├──────────────────────────────────────┤ ││
│ │ │ Tool 3/承認 1/0     │ │ │ [概要][ステップ][ツール][承認]        │ ││
│ │ ├────────────────────┤ │ ├──────────────────────────────────────┤ ││
│ │ │ ◐ r-1282 running   │ │ │ ([ツール] タブ)                       │ ││ Tools 廃止の
│ │ │ Thread t-6         │ │ │ ┌── Tool 実行 ─────────────────────┐ │ ││ 主要代替
│ │ │ Tool 1/承認 0/0    │ │ │ │ web.search  success  試行1/3      │ │ ││
│ │ ├────────────────────┤ │ │ │ risk: 中  by: t-7                 │ │ ││
│ │ │ ⚠ r-1281 waiting   │ │ │ │ [実行詳細]                        │ │ ││
│ │ │ 承認待ち: 2          │ │ │ ├ file.read  pending_approval ⚠    │ │ ││
│ │ └────────────────────┘ │ │ │ risk: 高  入力要約: ...           │ │ ││
│ │                        │ │ │ [承認] [却下] [詳細]              │ │ ││
│ │                        │ │ │ └──────────────────────────────────┘ │ ││
│ └────────────────────────┴──────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

コンポーネント階層:

1. 左: `RunList`（card）。filter（状態・`承認待ち` トグル・検索・Thread）。
   - 各 card: 状態(success/running/waiting/failed), Thread, 開始時刻, **Tool 件数/承認待ち件数/却下件数** の小サマリ（`Tool 3/承認 1/0` 等）。承認待ち >0 で warning accent。
2. 右: `RunDetail`。
   - ヘッダ: Run ID, 状態, Thread, 開始/所要, model policy ref。
   - in-detail tabs: `概要`/`ステップ`/`ツール`/`承認`。
     - `ツール` = Tool 実行（ToolInvocation の試行/結果/Event）。**Tools トップレベル廃止の主要代替**。
     - `承認` = 当該 Run に紐づく pending_approval ToolInvocation の承認/却下（AGENT-MANAGEMENT-UI-S007）。Overview の承認キューと同 source。
3. `ToolInvocationCard`（`ツール`/`承認` 内）: Tool 名, 状態, 試行回数, risk, by Thread, 入力要約, 結果 Event link, `実行詳細`/`承認`/`却下`/`詳細`。

## モバイル layout (< 1024px)

- 一覧 card 縦スタック。詳細は push 画面。`承認`/`却下` は sticky footer。
- `承認待ち` フィルタを toolbar 先頭に（管理者の主要タスク）。

## データと状態の契約（server-only 境界）

- Run 一覧・詳細・ToolInvocation は全て server-side Agent RPC。Agent-domain snapshot を Client D1 非保存。
- 承認/却下: server action が acting user context 付きで Agent RPC（AGENT-MANAGEMENT-UI-S007）。明示的 user confirmation 必須。

## 状態

- **loading（一覧/詳細）**: card/panel skeleton。
- **empty（一覧）**: `表示できる実行がありません / フィルタを解除`。
- **empty（詳細未選択）**: `実行を選択すると詳細が表示されます`。
- **error**: secret-safe。`実行の取得に失敗しました / 再試行`。
- **permission-denied（承認権限なし）**: `承認`/`却下` disabled + tooltip。閲覧は可。
- **optimistic（承認/却下送信中）**: 該当 card pending。Overview の承認キューとも同期（同 source の再取得で解決）。
- **running Run**: 状態 `実行中` + `再取得`。自動 polling は初期では手動（no-proxy 境界）。

## 文言 slot（日本語）

- h1: `実行`。filter: `状態`, `承認待ち`, `検索...`, `スレッド`。
- card 小サマリ: `Tool`, `承認`, `却下`（例: `ツール 3 / 承認待ち 1 / 却下 0`）。
- 詳細 tabs: `概要`, `ステップ`, `ツール`, `承認`。
- ToolInvocation card: `実行詳細`, `承認`, `却下`, `詳細`, `risk`, `試行`, `入力要約`, `結果`。
- 状態: `成功`, `実行中`, `待機中`, `失敗`, `承認待ち`, `承認済み`, `却下`。

## アクセシビリティ

- master-detail: `role="listbox"`/`option` + `aria-selected`、詳細 `role="region" aria-live="polite"`。
- tabs: `role="tablist"` + arrow-key。`承認`/`却下` は破壊的/非破壊の区別をラベル/`aria-label` で明示。
- risk(高/中/低) は色+アイコン+ラベルの3点セット。

## unit/client/engineer 向け実装メモ

- `packages/client/app/agents/[agentId]/runs/page.tsx`: master-detail + tabs へ再設計。server component で Run 一覧 RPC、詳細は個別 RPC。
- Tool 実行と承認情報は本画面の `ツール`/`承認` tab に配置し、Run context から追えるようにする。
- 承認/却下 server action: Overview と共通化（同一 server-only 関数を再利用。重複禁止: credo 4）。

## 未解決事項と前提

- A: Overview の承認キューと Runs の承認 tab は同 source（Agent RPC の pending_approval 一覧）。表示スコープ（Agent 全体 vs 単一 Run）だけが違う。
- Q: Run の「ステップ」詳細の粒度は Agent RPC の step 表現に依存。UI は順序付き timeline で表示する想定。
