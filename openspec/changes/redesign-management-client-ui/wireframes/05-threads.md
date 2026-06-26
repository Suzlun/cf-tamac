# 05 — Selected-Agent: Threads（+ Memory & Compaction 詳細）

## 目的と利用者

- 顧客: 管理者。Agent の自律判断を、Thread 単位で追跡したい。各 Thread で「何が起き、どう記憶され、どう compact されたか」まで見たい。
- 目的: Thread 一覧（card-first）＋ Thread 詳細。**Compactions の詳細は Thread 詳細内の「Memory & Compaction」パネルに集約**し、Compactions トップレベルを廃止する。

## Route と URL

- 一覧: `GET /agents/[agentId]/threads`
- 詳細: 同 page 内の選択状態（master-detail）または `GET /agents/[agentId]/threads?thread=...`/`#thread-...`。本ワイヤーフレームでは master-detail（一覧左・詳細右）を既定。

## デスクトップ layout — 一覧 + 詳細 master-detail (>= 1280px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌───────────────────────┬───────────────────────────────────────────┐│
│ │ スレッド              │ Thread 詳細: t-7                          ││
│ │ [🔍] [状態▼] [ソート▼] │ ┌──────────────────────────────────────┐ ││
│ │ ┌───────────────────┐ │ │ ヘッダ: t-7  ●active  Section: s-2   │ ││
│ │ │ ▸ t-7  ●active    │ │ │ 最終 Event: e-9912  最終 Run: r-1283 │ ││
│ │ │   Section s-2     │ │ ├──────────────────────────────────────┤ ││
│ │ │   最終: 2分前     │ │ │ [概要][イベント][実行][メモリ] ◄tabs │ ││
│ │ │   Memory m-12     │ │ ├──────────────────────────────────────┤ ││
│ │ │ ───────────────── │ │ │ (選択タブの内容)                      │ ││
│ │ │ ▸ t-6  ●paused    │ │ │                                      │ ││
│ │ │   ...             │ │ │ [メモリ] タブ選択時:                  │ ││
│ │ └───────────────────┘ │ │ ┌── Memory & Compaction ──────────┐  │ ││
│ │                       │ │ │ Memory 版: m-12                  │  │ ││
│ │ ┌───────────────────┐ │ │ │ 最新 Compaction: c-4 (1h前)      │  │ ││ Compactions
│ │ │ ▸ t-5  ●idle      │ │ │ │ Handoff: 1  rebase: 整合         │  │ ││ の代替
│ │ └───────────────────┘ │ │ │ provenance: ...                  │  │ ││
│ │                       │ │ │ History 参照: h-44               │  │ ││
│ │                       │ │ │ [Compaction 履歴 ▾]              │  │ ││
│ │                       │ │ └──────────────────────────────────┘  │ ││
│ └───────────────────────┴───────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

コンポーネント階層:

1. 左: `ThreadList`（card/tile）。filter（状態・ソート・検索）+ Thread card（key, 状態, Section, 最終 Event/Run, Memory 版）。
2. 右: `ThreadDetail`。
   - ヘッダ: Thread key, 状態, Section, 最終 Event/Run。
   - in-detail tabs: `概要`/`イベント`/`実行`/`メモリ`（`メモリ` = Memory & Compaction パネル = **Compactions 詳細の代替**）。
3. `MemoryCompactionPanel`（`メモリ` tab）: Memory 版, 最新 Compaction（ID/時刻/Handoff/rebase/provenance/History 参照）, Compaction 履歴の展開リスト（latest Handoff, Memory 版遷移, provenance, rebase 状態を順序付きで）（AGENT-MANAGEMENT-UI-S005）。

## デスクトップ layout — 一覧のみ (< 1280px or 詳細未選択)

- 一覧が全幅。Thread card 選択で詳細を右に開くか、別 route/overlay で展開。

## モバイル layout (< 1024px)

```
┌──────────────────────────┐
│ スレッド [🔍][状態▼]      │
│ ┌──────────────────────┐ │
│ │ ▸ t-7 ●active        │ │
│ │   最終 2分前          │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ ▸ t-6 ●paused        │ │
│ └──────────────────────┘ │
└──────────────────────────┘
  card タップ ↓ (push 詳細画面)
┌──────────────────────────┐
│ ← 戻る  Thread t-7       │
│ [概要][イベント][実行][メモリ]│
│ ...                      │
└──────────────────────────┘
```

- 詳細は別 view へ push（master-detail を縦に展開）。`メモリ` tab で Compaction 詳細を確認。

## データと状態の契約（server-only 境界）

- Thread 一覧・詳細・Memory/Compaction 全て server-side Agent RPC。Agent-domain snapshot を Client D1 非保存（AGENT-MANAGEMENT-UI-S005）。
- paging/絞り込みは Thread scope を維持（`agent_id` 保持）。

## 状態

- **loading（一覧）**: Thread card skeleton 数件。**loading（詳細）**: 詳細 panel skeleton。
- **empty（一覧）**: `このエージェントにはまだスレッドがありません`。
- **empty（詳細未選択）**: 右 panel `スレッドを選択すると詳細が表示されます`。
- **error**: secret-safe。`スレッドの取得に失敗しました / 再試行`。
- **Compaction 無し（新規 Thread）**: Memory パネル `このスレッドにはまだ Compaction がありません`。
- **permission-denied**: 閲覧のみ or `権限がありません`。
- **optimistic（状態変更がある場合）**: 該当 card を pending。

## 文言 slot（日本語）

- h1: `スレッド`。filter: `状態`, `ソート`, `検索...`。
- card: `最終 X前`, `Section`, `Memory 版`。
- 詳細 tabs: `概要`, `イベント`, `実行`, `メモリ`。
- Memory パネル: `Memory & Compaction`, `Memory 版`, `最新 Compaction`, `Handoff`, `rebase`, `provenance`, `History 参照`, `Compaction 履歴`, `最新 X前`, `整合`, `要確認`。

## アクセシビリティ

- master-detail: 一覧は `role="listbox"`/`option`（`aria-selected`）、詳細は `role="region" aria-live="polite"`。
- tabs: `role="tablist"`/`tab`/`tabpanel`、arrow-key、`aria-selected`。詳細未選択時の tabs は disabled。
- 構造化値（Thread key 等）は等幅 + `aria-label` で文脈付与。

## unit/client/engineer 向け実装メモ

- `packages/client/app/agents/[agentId]/threads/page.tsx`: master-detail へ再設計。server component で Thread 一覧 RPC、詳細は query/segment で個別 RPC。
- Compaction / Memory 情報は本画面の Memory パネルに配置し、Thread context から因果関係を追えるようにする。
- メモリ/Compaction データは全て Agent RPC。Client D1 非使用。

## 未解決事項と前提

- Q: Thread 詳細の tabs（概要/イベント/実行/メモリ）は Events/Runs 画面と重複するか。→ A: これは「単一 Thread に絞った cross-cut 詳細」。Events/Runs 画面は「Agent 全体の時系列」。両者はスコープが違うため共存。
- A: master-detail の詳細 URL を共有可能にするため `?thread=t-7&tab=memory` 形式を想定。
