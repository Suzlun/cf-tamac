# 08 — Selected-Agent: Schedules

## Intent & Users

- 顧客: 管理者。Agent の将来動作（Schedule）を作成・確認・取消し、次回発火や重複ポリシーを把握したい。
- 目的: Schedule 管理を card-first で。各 Schedule の状態・次回発火・重複ポリシーを要約で見せ、作成/取消を安全に行う（CLIENT-MANAGEMENT-S006）。

## Route & URL

- `GET /agents/[agentId]/schedules`
- 作成: 画面内の「スケジュールを作成」からモーダル/インラインフォーム（独立 sidebar 項目ではない）。

## Desktop layout (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ スケジュール              [🔍][状態▼][Thread ▼]  [+ スケジュールを作成]│
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ ┌────────────────────────────────────────────────────────────┐ │ │
│ │ │ ● sch-3   active   Thread t-7                                │ │ │ ScheduleCard
│ │ │ 次回発火: 2026-06-25 14:00 (JST)   overlap: ALLOW           │ │ │
│ │ │ 直近結果: 成功  /  直前実行: 10分前                           │ │ │
│ │ │ [一時停止] [取消] [詳細]                                      │ │ │
│ │ └────────────────────────────────────────────────────────────┘ │ │
│ │ ┌────────────────────────────────────────────────────────────┐ │ │
│ │ │ ○ sch-2  paused  Thread t-6  ...                            │ │ │
│ │ └────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

- `ScheduleCard`（card-first）。状態(active/paused/cancelled/failed), Thread, 次回発火, overlap policy, 直近結果/直前実行。actions: `一時停止`/`再開`, `取消`（破壊的・確認）, `詳細`。
- `スケジュールを作成`: モーダル/インライン。Thread context（必須）, cron/時刻, overlap policy, 初期 Event/入力を server 側で検証。
  - overlap policy: `ALLOW`/`COALESCE`/`BLOCK`（Agent 側定義に従う）の選択肢。

## Mobile layout (< 1024px)

- card 縦スタック。`スケジュールを作成` は FAB または header 右。作成フォームは full-screen sheet。`取消` は sticky 確認。

## Data & state contract（server-only 境界）

- Schedule 一覧/作成/取消/一時停止は全て server-side Agent RPC（`CreateSchedule`, `CancelSchedule`, 他）。Client D1 非使用（management-client spec S003/S004）。
- 作成・取消は acting user context 必須（CLIENT-MANAGEMENT-S006）。

## States

- **loading**: card skeleton。
- **empty**: `このエージェントにはスケジュールがありません` + `スケジュールを作成` CTA。
- **error**: secret-safe。`スケジュールの取得に失敗しました / 再試行`。
- **permission-denied**: `スケジュールを作成`/`取消` disabled + tooltip。閲覧は可。
- **optimistic（作成/取消/一時停止）**: 該当 card pending。
- **次回発火超過/失敗連続**: card に warning（`前回の発火に失敗しました` 等）。secret-safe。
- **作成バリデーション**: Thread 未指定・cron 不正・overlap 未選択を inline で表示。検証通過まで作成不可。

## Copy slots（日本語）

- h1: `スケジュール`。toolbar: `スケジュールを作成`, `状態`, `スレッド`, `検索...`。
- card: `次回発火`, `overlap`, `直近結果`, `直前実行`, `一時停止`, `再開`, `取消`, `詳細`。
- 作成フォーム: `スレッド`, `発火パターン`, `重複ポリシー`, `初期入力`, `作成`, `キャンセル`。
- 状態: `有効`, `一時停止`, `取消済み`, `失敗`。

## Accessibility

- card は `role="list"`/`listitem`。`取消` は破壊的として確認 dialog（`role="dialog" focus-trap`）。
- 次回発火時刻は `lang`/`title` で絶対時刻と相対時刻を両提示。
- overlap policy は `role="radiogroup"`/`radio` + 説明文。

## Integration notes for unit/client/engineer

- `packages/client/app/agents/[agentId]/schedules/page.tsx`: card-first へ再設計。server action で `CreateSchedule`/`CancelSchedule` 等（CLIENT-MANAGEMENT-S006）。

## Open questions / assumptions

- A: cron 入力の補助（human-friendly cron builder）は将来拡張。初期は生 cron + 予測される次回発火プレビュー（server 検証）。
