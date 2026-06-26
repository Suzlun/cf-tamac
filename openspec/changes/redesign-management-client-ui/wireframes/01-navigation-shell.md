# 01 — Navigation Shell（Topbar + 左サイドバー）

## 目的と利用者

- 顧客: 全管理者。あらゆる画面で「今どの Agent を見ているか」「全体設定か Agent 設定か」を1秒で把握したい。
- 目的: 水平タブを廃止し、Global area と Selected-Agent area を分離した左サイドバーで、Agent 選択状態と現在地を常に明示する。

## Route と URL

- Shell は全 route で共通（root layout 由来）。
- `/` → server redirect → `/agents`。
- Topbar はすべての route で描画。

## デスクトップ layout (>= 1024px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [≡ cf-tamac]                        [選択 Agent表示]    [User ▾]       │ Topbar (h:56)
├────────────────┬─────────────────────────────────────────────────────┤
│ SIDEBAR (w:248)│ CONTENT                                             │
│                │                                                     │
│  GLOBAL        │  ┌───────────────────────────────────────────────┐ │
│  ◉ Agents      │  │ Breadcrumbs: Agents / [Agent名] / Overview     │ │
│  ○ Settings    │  ├───────────────────────────────────────────────┤ │
│                │  │                                               │ │
│  AGENT         │  │  (画面本体)                                    │ │
│  ┌───────────┐ │  │                                               │ │
│  │▸ acme-bot ⩚│ │  │                                               │ │
│  └───────────┘ │  │                                               │ │
│   Overview  ◉  │  │                                               │ │
│   Threads   ○  │  │                                               │ │
│   Events    ○  │  │                                               │ │
│   Runs      ○  │  │                                               │ │
│   Schedules ○  │  │                                               │ │
│   Integrations│  │                                               │ │
│   Settings  ○  │  │                                               │ │
│                │  └───────────────────────────────────────────────┘ │
└────────────────┴─────────────────────────────────────────────────────┘
```

コンポーネント階層:

1. `Topbar`（sticky top。shadcn `Button`, `Avatar`, `DropdownMenu`, `Breadcrumb` を合成）
   - 左: ブランド `cf-tamac`（h1 相当、`/agents` への link）。
   - 右: 「選択 Agent 表示 chip（現在の選択 Agent 名 + `エージェント一覧へ` link）」「User menu（表示名 + ▾）」。
   - **Topbar は Agent selection 操作を直接提供しない**。Agent 選択は `Agents` 画面の責務とし、Topbar は現在選択の表示と `/agents` への導線だけを持つ。
2. `Sidebar`（sticky left, shadcn `ScrollArea`, `Separator`, `Button`, `Tooltip`, `Badge` を合成）
   - セクションラベル `GLOBAL`（小文字 caps, mute）。
   - Global items: `Agents`(`/agents`), `Settings`(`/settings`)。
   - セクションラベル `AGENT`（選択中 Agent 名を status chip で表示）。
   - Selected-Agent items（`aria-current` で現在地）。未選択時はこのセクション全体が hidden または disabled+tooltip。
3. `Content`（`<main id="main-content">`）。先頭に shadcn `Breadcrumb` を描画。

## モバイル layout (< 1024px)

```
┌──────────────────────────────────────┐
│ [≡]  cf-tamac        [Agent] [👤▾]     │ Topbar
├──────────────────────────────────────┤
│ Breadcrumbs                          │
│                                      │
│ (画面本体)                            │
│                                      │
└──────────────────────────────────────┘
  [≡] を押す ↓
┌──────────────┐ ← Drawer (左からスライド, backdrop 付き)
│ GLOBAL       │
│  Agents      │
│  Settings    │
│ AGENT ▾      │
│  Overview    │
│  Threads     │
│  ...         │
└──────────────┘
```

- サイドバーは shadcn `Sheet` で drawer 化。Topbar の `≡`（hamburger）は shadcn `Button` で、`aria-expanded` 必須。
- drawer オープン時: focus を最初の menuitem に移動。Esc で閉じ、focus を `≡` に戻す。
- リンク選択時は drawer を自動 close。
- Topbar の Agent 表示 chip はモバイルでも利用（小画面では名前省略+アバターのみ）。切替操作は chip の直接 dropdown ではなく `/agents` への導線で行う。

## Agent 選択状態マシン（核心）

選択状態は **server-resolved** であり、Browser には Agent display metadata のみ渡す（Agent credential なし）。

| 状態                     | 表示                                                                                                                                                                       | 遷移                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `selected`               | sidebar の AGENT セクションに選択 Agent 名・アバター表示。selected-Agent items 有効。Topbar chip に同じ Agent 表示。                                                       | Agents 一覧で Agent を開く / 直 URL `/agents/[id]/*` アクセス。 |
| `none`                   | AGENT セクションは「Agent 未選択」ガイダンスに差替（`Agents へ移動` ボタン）。selected-Agent items は `disabled` + `aria-disabled` + tooltip「Agent を選択してください」。 | `Agents` 画面で選択。                                           |
| `none-on-selected-route` | selected-Agent area 配下 route に未選択で直アクセスした場合 → 専用 empty state「この画面には Agent の選択が必要です」+ `Agents へ移動` CTA。                               | CTA → `/agents`。                                               |

- 選択状態の保持: Client D1 の managed Agent record の `last-opened` メタデータを server action で更新（既存 `markManagedAgentOpened`）。Browser には cookie/session 表現で選択 ID を持たせるが、**credential は含めない**。
- Topbar chip は選択 Agent の表示と `Agents 全一覧へ` link のみを持つ。最近開いた Agent の一覧や cross-Agent quick switcher は提供しない。

## データと状態の契約（server-only 境界）

- `getCurrentSelection()`（server-only）: cookie/session から選択 Agent ID を読み、Client D1 の managed Agent record から display metadata（表示名, アバターシード, status サマリ）のみ取得。credential は取得しない。
- Sidebar/Topbar はこの server-resolved 値を props で受ける Server Component として描画。Client component 化する場合も Agent RPC / credential import 禁止。
- 選択切替は Server Action（`selectManagedAgent` 相当）。楽観的更新は「選択中表示」のみ。失敗時は前選択へ復元 + secret-safe トースト。

## 状態

- **loading**: sidebar 項目・Agent 表示 chip は skeleton chip。Topbar ブランドは即時表示。
- **error（選択メタデータ取得失敗）**: AGENT セクションを「Agent 情報の取得に失敗しました / 再試行」に差替。credential 非表示維持。
- **permission-denied**: Global Settings のような権限依存項目は、権限不足時に disabled + tooltip「この操作には権限が必要です」。
- **selected-agent-required**: 上記状態マシン表参照。
- **optimistic（選択切替中）**: Agents 画面の選択 action と sidebar に進行表示。他操作は抑制。

## 文言 slot（日本語）

- ブランド: `cf-tamac`（固定）。
- セクションラベル: `グローバル` / `エージェント`（または `GLOBAL` / `AGENT`。小文字 caps 表現で統一）。
- Global items: `エージェント` / `設定`。
- Selected-Agent items: `概要` / `スレッド` / `イベント` / `実行` / `スケジュール` / `インテグレーション` / `設定`。
  - ※ `実行` = Runs。`スレッド` = Threads。`インテグレーション` = Integrations。
- 未選択ガイダンス: `エージェントを選択してください` + ボタン `エージェント一覧へ`。
- Agent 表示 chip ラベル: `選択中のエージェント`。未選択時: `エージェント未選択`。
- hamburger `aria-label`: `ナビゲーションを開く` / `ナビゲーションを閉じる`。
- skip link: `メインコンテンツへスキップ`。

## アクセシビリティ

- skip-to-content リンクを Topbar の最初に配置（Tab 1 回で到達）。
- Sidebar は `role="navigation" aria-label="主要ナビゲーション"`。`menubar`/`menuitem` で arrow-key 対応。
- 現在地は `aria-current="page"`。選択中 Agent chip は `aria-current="true"` 相当の表現。
- drawer: `role="dialog" aria-modal="true" aria-label="ナビゲーション"`、focus trap、Esc close、backdrop click close。
- 色/アイコン単独の状態表現禁止。selected は背景 tint + 左アクセントバー + ラベル。
- `prefers-reduced-motion`: drawer スライド・進行表示のアニメを無効化。

## shadcn/ui 対応

- Topbar: `Button`, `Avatar`, `DropdownMenu`, `Breadcrumb`, `Tooltip`。
- Desktop Sidebar: `ScrollArea`, `Separator`, `Button`, `Badge`, `Tooltip`。
- Mobile Sidebar: `Sheet`, `ScrollArea`, `Separator`, `Button`。
- Selected Agent display: `Avatar`, `Badge`, `Button`。
- Loading and error states: `Skeleton`, `Alert`。
- 画面実装前に `00-shadcn-full-copy-contract.md` の official shadcn/ui full copy を完了し、独自 `.control-room` / `.topline` / `.nav-link` class を使わない。

## unit/client/engineer 向け実装メモ

編集不可（設計指示のみ）。以下は実装ターゲットの目安:

- `packages/client/app/layout.tsx`: 現状 `<main className="app-shell">` のみ。`app-shell` custom class を削除し、Topbar + Sidebar を含む `AppShell` Server Component を shadcn/ui composition で新設し、children を Content slot に。
- 新規: `packages/client/app/(shell)/layout.tsx` 等 route group で shell を適用、または root layout に組込み。`/` は redirect を `next.config` or `app/page.tsx` で `redirect('/agents')`。
- 新規 component（`packages/client/src/components/shell/` 想定）: `AppShell`, `Topbar`, `Sidebar`, `AgentSwitcher`, `Breadcrumb`。これらは Browser-visible だが **Agent RPC / credential import 禁止**。server-only モジュール（`packages/client/src/server/`）から display metadata のみ受ける。
- 新規 server-only: `packages/client/src/server/navigation/`（例）に `getCurrentSelection`, `selectManagedAgent`, `getRecentAgents`。既存 `markManagedAgentOpened` を再利用（重複実装禁止: credo 4）。
- 全 Agent-scoped route（`/agents/[agentId]/*`）は layout または各 page で「選択 Agent 存在チェック → `notFound()` or 未選択ガイダンス」。

## 未解決事項と前提

- Q: 選択状態の永続化は cookie で十分か、session（D1）が必要か。→ A: 基本は cookie（httpOnly, credential 無し）。`last-opened` 更新は server action。要件次第で session 表現に拡張可能だが、本ワイヤーフレームでは cookie + server action を想定。
- A: dark theme を既定で提供するか。→ 提供する（token 双方定義）。既定は light、User menu で切替。
- A: 多言語。→ 既定 `ja`（現状 `<html lang="ja">`）。本ワイヤーフレームの copy は日本語。
