# 03 — Global: Global Settings（cross-Agent 設定）

## 目的と利用者

- 顧客: 管理者。特定 Agent ではなく、Management Client 全体・認証基盤・表示設定を管理したい。
- 目的: cross-Agent UI は `Agents` と本画面のみ。ここに「特定 Agent に属さない設定」を集約する。

## Route と URL

- `GET /settings`（Global Settings。`/agents/[id]/settings` とは別物）。

## デスクトップ layout (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ グローバル設定                                                    │ │ h1
│ │ cf-tamac Management Client 全体の設定を管理します。               │ │
│ ├───────────────────────────┬──────────────────────────────────────┤ │
│ │ セクション nav (in-content)│ 詳細 panel                           │ │
│ │ ◉ 認証基盤                │ ┌──────────────────────────────────┐ │ │
│ │ ○ 表示設定                │ │ 認証基盤                          │ │ │
│ │ ○ 通知                    │ │ ...                               │ │ │
│ │ ○ 危険な操作              │ └──────────────────────────────────┘ │ │
│ └───────────────────────────┴──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

- 左 sidebar（グローバル shell）とは別に、画面内にセクション nav（in-content secondary nav）を置く。`Global Settings` のセクション切替はこの in-content nav で行い、sidebar は増やさない（IA 制約遵守）。
- セクション（初期）:
  - **認証基盤**: Management Client 自身の管理者認証・セッション・Role/権限の概要（credential 値は非表示・参照のみ）。
  - **表示設定**: テーマ(light/dark/system), 言語, 密度, タイムゾーン, 日時書式。
  - **通知**: （将来拡張）System 通知チャネルの既定値。
  - **危険な操作**: 管理対象 Agent の一括無効化や、Client D1 の整合性確認など、cross-Agent の慎重操作。実行は明示的確認を必須化。

## モバイル layout (< 1024px)

```
┌──────────────────────────┐
│ グローバル設定            │
│ [セクション: 認証基盤 ▾]  │ ← select/dropdown で切替
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ 認証基盤              │ │
│ │ ...                  │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- in-content nav は dropdown 化。

## データと状態の契約（server-only 境界）

- 設定読み書きは Server Component / Server Action。表示設定（テーマ等）のうち Browser で即時反映が必要なものは、client component で UI のみ操作し、永続化は server action。
- **Agent credential は一切扱わない**。認証基盤セクションは「Management Client の管理者認証」のみ（Agent の credential は各 Agent Settings 配下）。

## 状態

- **loading**: 詳細 panel に skeleton。
- **error**: secret-safe。「設定の取得に失敗しました / 再試行」。
- **permission-denied**: セクション単位で権限不足を表示。`認証基盤` など高権限セクションは disabled + tooltip。
- **optimistic（保存中）**: `保存` disabled + pending。「保存中…」。
- **dangerous-action confirmation**: `危険な操作` の実行は確認ダイアログ（type "critical"）。実行内容・影響範囲を明示。

## 文言 slot（日本語）

- h1: `グローバル設定`。説明: `cf-tamac Management Client 全体の設定を管理します。`
- セクション: `認証基盤`, `表示設定`, `通知`, `危険な操作`。
- 表示設定ラベル: `テーマ`（`ライト`/`ダーク`/`システム`）, `言語`, `密度`, `タイムゾーン`, `日時書式`。
- アクション: `保存`, `保存中…`, `再試行`。
- 権限: `このセクションには権限が必要です`。

## アクセシビリティ

- in-content nav は `role="tablist"`/`tab`/`tabpanel`、または `role="navigation"`。arrow-key 対応。`aria-current`。
- dangerous 確認 dialog: `role="dialog" aria-modal focus-trap`、破壊的 action は `aria-label`/ラベルで「元に戻せない」を明示。

## unit/client/engineer 向け実装メモ

- 新規 route: `packages/client/app/settings/page.tsx`（`Global Settings`）。既存の `/agents/[id]/settings` と混同しない。
- この change では新しい Client D1 table を追加せず、既存の Client-owned metadata、cookie、server-only config の範囲で扱う。Agent-domain snapshot と secret は扱わず、表示設定を Browser で即時反映する client component も credential・Agent RPC import 禁止を守る。

## 未解決事項と前提

- Q: 管理者認証・Role モデルの具体は別 spec。→ 本ワイヤーフレームでは「概要表示 + 権限依存の disable」のみ仕様化。詳細は `agent-management-ui` / 認証 spec に委ねる。
- A: `通知` セクションは将来拡張のプレースホルダ。初期実装では「近日対応」empty state を許容しない（クレド6）→ 初期は該当セクションを出さず、必要になってから追加。
