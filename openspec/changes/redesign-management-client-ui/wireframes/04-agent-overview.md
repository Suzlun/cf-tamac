# 04 — Selected-Agent: Overview

## 目的と利用者

- 顧客: 管理者。選択中 Agent が「今どうなっているか」を1画面で把握したい。健全性・待機中の承認・最近の活動・メモリ状況を要約で見る。
- 目的: selected-Agent area のホーム。Compaction/Memory の集約サマリもここに提示し、Compactions トップレベルを廃止する根拠とする。

## Route と URL

- `GET /agents/[agentId]`（選択 Agent の Overview）。
- 前提: 選択 Agent が Client D1 の managed Agent record に存在すること。未選択・未登録は `notFound()` or 未選択ガイダンス。

## デスクトップ layout (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [avatar] acme-prod-bot  ● 正常  ● credential 有効  config v3     │ │ Agent header
│ │ 最終同期: 2分前   [再取得]  [エージェント設定へ]                  │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │ │ KPI tiles (card)
│ │ │ ライフサイクル│ │ 実行中 Run │ │ 待機中 Thread│ │ 承認待ち    │ │ │
│ │ │ ACTIVE   │ │ 3        │ │ 12       │ │ 2 ⚠       │ │ summary tiles
│ │ │ v3 cfg   │ │ 直近1h   │ │ アクティブ│ │ ToolInv.  │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │ │
│ ├──────────────────────────┬──────────────────────────────────────┤ │
│ │ 承認待ち（ToolInvocation）│ 最近の活動                            │ │
│ │ ┌──────────────────────┐ │ ┌──────────────────────────────────┐│ │
│ │ │ ⚠ pending: web.search│ │ │ Run #r-1283  success  2分前        ││ │
│ │ │ risk: 中  by:  Thread │ │ │ Event #e-9912  type=TOOL  3分前   ││ │
│ │ │ ──────────────────── │ │ │ Thread t-7  resumed  5分前         ││ │
│ │ │ [承認] [却下] [詳細]  │ │ │ Schedule sch-3  fired  10分前     ││ │
│ │ ├──────────────────────┤ │ └──────────────────────────────────┘│ │
│ │ │ ⚠ pending: file.read │ │ [もっと見る → 実行]                  │ │
│ │ │ ...                  │ │                                      │ │
│ │ └──────────────────────┘ │                                      │ │
│ ├──────────────────────────┴──────────────────────────────────────┤ │
│ │ メモリ & Compaction（集約サマリ）                                  │ │ Compactions の代替表示
│ │ Memory 版: m-12  最新 Compaction: c-4  rebase: 整合  Handoff: 1  │ │
│ │ ┌──────────────────────────────────────┐  [スレッドのメモリを確認→]│ │
│ │ │ 健康: ●良好  最終 Compaction: 1h前   │                         │ │
│ │ └──────────────────────────────────────┘                         │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

コンポーネント階層:

1. `AgentHeader`: アバター・表示名・status pill・credential pill・config version・最終同期時刻・`再取得`・`エージェント設定へ`。
2. `SummaryTileGrid`（4 tiles）: ライフサイクル, 実行中 Run, 待機中 Thread, 承認待ち ToolInvocation。
   - `承認待ち` tile は数が >0 で warning accent。tile 押下で承認キューへスクロール/展開。
3. `ApprovalQueueCard`（ToolInvocation `pending_approval`）: risk・由来 Thread・要約・`承認`/`却下`/`詳細`。ここが **Tools トップレベル廃止の代替の1つ**。
4. `RecentActivityFeed`: Run/Event/Thread/Schedule の時系列サマリ。各項目から該当画面へ deep link。
5. `MemoryCompactionSummary`: Memory 版・最新 Compaction ID・rebase 状態・Handoff 数・健康度。これが **Compactions トップレベル廃止の代替（集約）**。詳細は Threads の Thread 詳細へ。

## モバイル layout (< 1024px)

- KPI tiles: 2x2 grid。承認キュー・最近活動・メモリは縦スタック。
- `承認`/`却下` は sticky footer 化して誤操作防止。

## データと状態の契約（server-only 境界）

- 全データ server-side Agent RPC から取得。`GetAgent`（profile/lifecycle/config/capability 要約）+ 承認待ち ToolInvocation 一覧 + 最近活動 + Memory/Compaction 集約。
- **Agent-domain snapshot を Client D1 に保存しない**。毎回 RPC から取得（management-client-shell spec S003/S004）。
- 承認/却下: server action が acting user context 付きで Agent RPC を呼ぶ（AGENT-MANAGEMENT-UI-S007）。

## 状態

- **loading**: KPI tiles skeleton + 各 card skeleton。header のみ即時（managed Agent display metadata）。
- **empty（新規 Agent・活動なし）**: 承認キュー「承認待ちの項目はありません」。活動「最近の活動はありません」。メモリ「まだ Compaction がありません」。それぞれ次のアクションを提示（例: Thread を開始する方法への導線）。
- **error（RPC 失敗）**: secret-safe。「Agent との通信に失敗しました / 再取得」。credential・生スタック非表示。
- **permission-denied（承認権限なし）**: `承認`/`却下` を disabled + tooltip「承認権限が必要です」。閲覧のみ可。
- **optimistic（承認/却下送信中）**: 該当 card を pending 表示、他 card は操作可。
- **危険状態**: Run 連続失敗・credential 無効・接続不可を status pill + banner で上方に警告（secret-safe）。

## 文言 slot（日本語）

- KPI tile ラベル: `ライフサイクル`, `実行中の実行`, `待機中のスレッド`, `承認待ち`。
- 承認キュー: `承認待ち（ツール実行の承認）`, `承認`, `却下`, `詳細`, `risk`, `由来`, `要約`。
- 最近活動: `最近の活動`, `もっと見る`。
- メモリ: `メモリ & Compaction`, `Memory 版`, `最新 Compaction`, `rebase`, `Handoff`, `健康`, `スレッドのメモリを確認`。
- header: `再取得`, `エージェント設定へ`, `最終同期 X前`。

## アクセシビリティ

- tiles は `role="group"`/link。数値とラベルを明示。warning は色+アイコン+ラベル。
- 承認 `承認`/`却下` は破壊的でない/破壊的の区別を `aria-label`/ラベルで明示。keyboard で到達可能、順序: 承認→却下→詳細。
- banner は `role="status"`/`aria-live="polite"`。secret は流さない。

## unit/client/engineer 向け実装メモ

- `packages/client/app/agents/[agentId]/page.tsx`: Overview として再設計。server component で Agent RPC を並列取得（Promise.all）し、display 用 shape に変換。
- 承認/却下 server action: `packages/client/src/server/actions/` 配下。ToolInvocation 承認 RPC を呼ぶ。Browser-visible component は RPC import 禁止。
- Compaction summary は Overview と Threads 詳細に配置し、Agent-scoped context で確認できるようにする。

## 未解決事項と前提

- A: 承認待ちが多い場合、Overview には上位 N 件のみ表示し、全件は Runs 詳細の承認ビューへ誘導。
- Q: Memory/Compaction 健康「良好」の判定基準は Agent 側定義に依存。UI は Agent RPC の health 字段をそのまま表示する想定。
