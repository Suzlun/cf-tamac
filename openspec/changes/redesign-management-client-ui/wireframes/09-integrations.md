# 09 — Selected-Agent: Integrations（+ Tool カタログ）

## Intent & Users

- 顧客: 管理者。汎用 Integration manifest で install/list/uninstall し、Adapter Connection・Tool・Delivery capability・setup 状態を確認したい。
- 目的: Integration の install/list/uninstall と、それが提供する **Tool カタログ（Tool definition/Installation 所有関係）をここに集約**し、Tools トップレベルを廃止する根拠とする（AGENT-MANAGEMENT-UI-S008）。

## Route & URL

- `GET /agents/[agentId]/integrations`
- 詳細: master-detail または `?installation=...`。

## Desktop layout (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ インテグレーション            [🔍][状態▼]  [+ インテグレーションを追加]│
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ ┌────────────────────────┐ ┌──────────────────────────────────┐ │ │
│ │ │ ◉ github-app            │ │ Installation: github-app          │ │ │ master-detail
│ │ │ ● installed   v1.2      │ │ manifest id: ...   provider: GitHub│ │ │
│ │ │ Adapter: ● connected    │ │ ┌──────────────────────────────┐ │ │ │
│ │ │ Tools: 4   Delivery: ●  │ │ │ [概要][アダプタ][ツール][権限付与]│ │ │
│ │ │ setup: ●完了            │ │ ├──────────────────────────────┤ │ │ │
│ │ │ [詳細] [アンインストール]│ │ │ ([ツール] タブ)               │ │ │ │ Tools 廃止の
│ │ ├────────────────────────┤ │ │ ┌ Tool カタログ ─────────────┐│ │ ││ 代替(カタログ)
│ │ │ ○ slack                 │ │ │ │ web.search  installed      ││ │ ││
│ │ │ ⚠ setup 未完了          │ │ │ │ file.read   installed      ││ │ ││
│ │ │ ...                     │ │ │ │ ...                        ││ │ ││
│ │ └────────────────────────┘ │ │ └──────────────────────────────┘│ │ │
│ │                            │ └──────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

コンポーネント階層:

1. 左: `IntegrationList`（card）。状態(installed/setup未完了/error), Adapter Connection status, Tool 件数, Delivery capability status, setup 状態。actions: `詳細`, `アンインストール`（破壊的・確認）。
2. 右: `IntegrationDetail`。
   - in-detail tabs: `概要`/`アダプタ`/`ツール`/`権限付与`。
     - `ツール` = Tool カタログ（Tool definition, Installation 所有関係, invocation 状態サマリ）。**Tools トップレベル廃止の代替（カタログ側）**。実行/承認は Runs/Overview へ導線。
     - `アダプタ` = Adapter Connection 状態・grant・setup 手順。
     - `権限付与` = grant 一覧・状態。
3. `+ インテグレーションを追加`: manifest 入力/選択 → server 側で署名検証 → install（AGENT-MANAGEMENT-UI-S008）。

## Mobile layout (< 1024px)

- card 縦スタック。詳細 push 画面。`アンインストール` は確認 sheet。

## Data & state contract（server-only 境界）

- 全て server-side Agent RPC。Integration manifest の署名検証も server 側。manifest/署名 material を Browser に渡さない（AGENT-MANAGEMENT-UI-S008/S009）。
- install/uninstall は acting user context 必須。

## States

- **loading**: card/panel skeleton。
- **empty（一覧）**: `このエージェントにインストールされたインテグレーションはありません` + `インテグレーションを追加` CTA。
- **empty（詳細未選択）**: `インテグレーションを選択すると詳細が表示されます`。
- **error**: secret-safe。`インテグレーションの取得に失敗しました / 再試行`。
- **permission-denied**: `インテグレーションを追加`/`アンインストール` disabled + tooltip。
- **optimistic（install/uninstall）**: 該当 card pending。
- **setup 未完了**: card に `setup 未完了` warning + `setup 手順を確認` リンク。
- **Adapter 未接続**: card に `アダプタ未接続` + `接続状態を確認`。
- **install 検証失敗**: manifest 不正・署名無効・既存 Integration 競合を inline で表示（secret-safe）。

## Copy slots（日本語）

- h1: `インテグレーション`。toolbar: `インテグレーションを追加`, `状態`, `検索...`。
- card: `アダプタ`, `ツール`, `配信`, `setup`, `詳細`, `アンインストール`。
- 詳細 tabs: `概要`, `アダプタ`, `ツール`, `権限付与`。
- 追加フォーム: `マニフェスト`, `検証`, `インストール`, `キャンセル`。
- 状態: `インストール済み`, `setup 未完了`, `エラー`, `アンインストール済み`。

## Accessibility

- master-detail roles（`listbox`/`option`/`region`）。tabs roles。
- `アンインストール` は破壊的確認 dialog。影響範囲（Tool が使えなくなる等）を明示。
- status は色+アイコン+ラベル。

## Integration notes for unit/client/engineer

- `packages/client/app/agents/[agentId]/integrations/page.tsx`: master-detail + tabs へ再設計。server action で Integration install/uninstall/list（AGENT-MANAGEMENT-UI-S008）。
- Tool catalog は本画面の `ツール` tab に配置し、Integration context から確認できるようにする。

## Open questions / assumptions

- A: Tool カタログ（本画面）は Tool 定義と所有関係の表示。実行履歴は Runs/Events、承認は Runs/Overview と役割分担（重複なし: credo 4）。
