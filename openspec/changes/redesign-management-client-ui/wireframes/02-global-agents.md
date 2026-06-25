# 02 — Global: Agents（一覧・New Agent 登録・選択）

## Intent & Users

- 顧客: 管理者。管理対象 Agent を一覧し、新規 Agent を登録し、Agent を選択して selected-Agent area へ入る入口。
- 目的: cross-Agent 操作はこの画面と Global Settings だけに限定。`New Agent` はこの画面内のアクション（サイドバー項目ではない）。

## Route & URL

- 一覧: `GET /agents`
- 新規登録: `/agents` の「エージェントを追加」ボタンから同一画面内の登録 panel / dialog を起動する。`/agents/new` は独立 screen / route として扱わない。
- 選択: 一覧 card の「開く」で Server Action `selectManagedAgent` → selected-Agent area へ遷移。

## Desktop layout — 一覧 (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT (within shell)                                              │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ エージェント              [🔍 検索...]  [+ エージェントを追加]    │ │ Toolbar
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Pinned ─────────────────────────────                             │ │
│ │ ┌────────────────────┐ ┌────────────────────┐                    │ │
│ │ │ ▸ acme-prod-bot    │ │ ▸ acme-staging     │   AgentCard        │ │
│ │ │ ● 正常  v3 cfg     │ │ ● 正常  v2 cfg     │                     │ │
│ │ │ RPC: …workers.dev  │ │ RPC: …workers.dev  │                     │ │
│ │ │ 最終: 2分前 [📌]   │ │ 最終: 1時間前 [📌] │                     │ │
│ │ │ credential: ●有効  │ │ credential: ●有効  │                     │ │
│ │ │ [開く] […]         │ │ [開く] […]         │                     │ │
│ │ └────────────────────┘ └────────────────────┘                    │ │
│ │                                                                   │ │
│ │ その他 ────────────────────────────                               │ │
│ │ ┌────────────────────┐                                            │ │
│ │ │ ▸ sandbox-agent    │                                            │ │
│ │ │ ⚠ 接続不可         │                                            │ │
│ │ │ ...                │                                            │ │
│ │ └────────────────────┘                                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

コンポーネント階層:

1. `PageHeader`: `h1 エージェント`。右に toolbar。
2. Toolbar: `検索`（表示名/Agent ID の前方・部分一致、client-side または server 検索）, `エージェントを追加`（primary button → 同一画面内の登録 panel / dialog）。
3. `AgentList`（card-first。既存 `packages/client/src/components/agent-list.tsx` を card 化へ再設計）。
   - グループ: `ピン留め` / `その他`（既存 pin/並び順メタデータを使用。CLIENT-MANAGEMENT-S001）。
   - `AgentCard`（各 Agent）:
     - 行1: アバターシード + 表示名（`/agents/[id]` link）。
     - 行2: status pill（アイコン+色+ラベル）+ config version。
     - 行3: RPC origin（等幅・mask 済み表示可）。
     - 行4: 最終閲覧時刻 + pin toggle（既存 `setManagedAgentPinned`）。
     - 行5: credential status pill（有効/無効/参照切れ）。
     - actions: `開く`（primary → 選択＋遷移）, `[…]`（メニュー: 編集/ピン留め切替/詳細/無効化）。
4. **table は既定で使わない**。高密度比較が必要な場合は card 内の `詳細` 展開で table を出す（オプショナル）。

## Mobile layout — 一覧 (< 1024px)

```
┌──────────────────────────┐
│ エージェント   [+ 追加]   │
│ [🔍 検索...]             │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ ▸ acme-prod-bot      │ │ AgentCard（縦積み）
│ │ ● 正常  最終 2分前    │ │
│ │ [開く]        […]     │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ ▸ acme-staging       │ │
│ │ ...                  │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- card は1列。toolbar は折り返し。`追加` は FAB または header 右。
- pin/アクションは card 内 `[…]` メニューに集約し、横幅を確保。

## Desktop layout — New Agent 登録（Agents 画面内 panel / dialog）

`New Agent` を独立 sidebar 項目・独立 screen・独立 route にせず、「画面内アクションから開く登録フロー」として再設計。

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ← エージェント一覧                                                │ │
│ │ 新規エージェントの登録                                            │ │ h1
│ │ 管理対象 Agent の接続情報と初期設定を登録します。                  │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ ┌────────────────────────┐  ┌─────────────────────────────────┐ │ │
│ │ │ 1. 接続情報             │  │ 2. 表示情報                      │ │ │ Stepper (縦/横)
│ │ │  Agent ID *            │  │  表示名 *                        │ │
│ │ │  RPC origin *          │  │  説明（任意）                    │ │
│ │ │  Credential 参照 *     │  │  ピン留め □                      │ │
│ │ │  [接続を検証]          │  │                                  │ │
│ │ ├────────────────────────┤  ├─────────────────────────────────┤ │
│ │ │ 3. 初期モデルポリシー    │  │ 4. 確認                          │ │
│ │ │  Provider *            │  │  入力内容の確認                   │ │
│ │ │  Model *               │  │  [登録して選択]                   │ │
│ │ │  Policy ref *          │  │                                  │ │
│ │ │  Generation params     │  │                                  │ │
│ │ │  [ポリシーを検証]       │  │                                  │ │
│ │ └────────────────────────┘  └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

- ステップ: `1.接続情報` → `2.表示情報` → `3.初期モデルポリシー` → `4.確認`。
- `接続を検証`: server-side で RPC origin 到達性と credential 参照の有効性を検証（credential 値は browser に渡さず、参照キーのみ送信）。CLIENT-MANAGEMENT-S002。
- `ポリシーを検証`: server-side で `ValidateModelPolicy` RPC（CLIENT-MANAGEMENT-S017）。Provider credential・生 token は非表示。
- 最終 `登録して選択`: server-side で `InitializeAgent` + initial model policy + `initialConfig.modelPolicyRef` を同一フローで送信（CLIENT-MANAGEMENT-S017）。成功後、自動的に選択状態にして `/agents/[id]`（Overview）へ遷移。

## Mobile layout — New Agent

- ステップは1画面1ステップの縦移動。`戻る` / `次へ`。進捗は上部 stepper（ドット）。
- 検証ボタンは sticky footer に。

## Data & state contract（server-only 境界）

- 一覧: `listManagedAgentsWithCredentialStatus`（既存 server action）から managed Agent records + credential status（masked hint のみ）を取得。Browser に credential 値は渡さない。
- 選択: `selectManagedAgent`（新規 server action）→ cookie 書換 + `markManagedAgentOpened` 更新。
- 登録: server-only モジュールが generated Agent RPC client を使用。Browser-visible module は RPC client / Connect runtime / credential 解決ロジックを import しない（CLIENT-MANAGEMENT-S017）。

## States

- **loading（一覧）**: `AgentCard` の skeleton 行を grid に並べる。
- **empty（一覧）**: 中央に「まだエージェントが登録されていません」+ `エージェントを追加` CTA + 「Agent ID・RPC origin・credential 参照を用意してください」ガイダンス。
- **error（一覧取得失敗）**: secret-safe。「エージェント一覧の取得に失敗しました / 再試行」。credential 非表示。
- **search empty**: 検索語に一致する Agent がない場合「一致するエージェントがありません / 検索をクリア」。
- **credential 参照切れ**: card に `credential: ●無効（参照切れ）` pill + `設定で修復` リンク（`/agents/[id]/settings`）。
- **接続不可 Agent**: card に `⚠ 接続不可` + 最終確認時刻 + `再接続を確認`。
- **loading（登録フロー 検証中）**: 検証ボタン disabled + inline pending。「接続を検証中…」。
- **error（検証失敗）**: inline・field 紐付け。origin 到達不能・credential 無効・policy 不正をそれぞれ該当 field に表示（secret-safe）。
- **optimistic（登録送信）**: `登録して選択` disabled + progress。成功時自動遷移。
- **permission-denied（登録権限なし）**: フォーム全体を read-only or 専用 state「エージェントの登録権限がありません」。

## Copy slots（日本語）

- h1: `エージェント`。toolbar: `エージェントを追加`, `検索...`。
- グループラベル: `ピン留め`, `その他`。
- card: `開く`, `最終 X前`, `ピン留め`, `ピン留めを解除`, `設定`, `編集`, `無効化`。
- credential pill: `有効`, `無効`, `参照切れ`。
- status pill: `正常`, `接続不可`, `不明`, `初期化中`。
- empty（一覧）: `まだエージェントが登録されていません` / `Agent ID・RPC origin・credential 参照をご用意のうえ、追加してください`。
- 登録 h1: `新規エージェントの登録`。戻る: `エージェント一覧へ`。
- 登録ステップ: `接続情報`, `表示情報`, `初期モデルポリシー`, `確認`。
- 登録フィールドラベル: `Agent ID`, `RPC origin`, `Credential 参照`, `表示名`, `説明`, `Provider`, `Model`, `Policy ref`, `Generation parameters`。
- 登録アクション: `接続を検証`, `ポリシーを検証`, `登録して選択`, `戻る`, `次へ`。

## Accessibility

- 一覧 card は `article` 相当。`開く` が primary CTA。card 全体クリック可能にする場合は、内側の個別リンクと重複しないよう `aria-labelledby`/`aria-describedby` で関係付け。
- 検索: `role="search"`、`label` 必須。
- 登録 stepper: `role="group" aria-label="登録ステップ"`、各ステップ `aria-current="step"`。エラーは `aria-describedby` で field に紐付け。
- pin toggle: `aria-pressed` で ON/OFF。状態ラベル必須。

## Integration notes for unit/client/engineer

- `packages/client/app/agents/page.tsx`: 既存 `AgentList` を card-first 仕様へ更新（client component は props 受けのまま、内部 render を card 化）。`listManagedAgentsWithCredentialStatus` 再利用。
- `packages/client/app/agents/new/page.tsx`: 独立 route としては廃止し、登録 stepper は `/agents` 画面内の panel / dialog へ統合する。server action で `InitializeAgent` + model policy フローを構成（CLIENT-MANAGEMENT-S017/S002）。
- 新規 server-only: `selectManagedAgent`。`packages/client/src/server/actions/managed-agents.ts` に集約（既存 `setManagedAgentPinned`/`markManagedAgentOpened` と同所。重複禁止）。
- `packages/client/src/components/agent-list.tsx` を card grid へ。新規 `agent-card.tsx`。

## Open questions / assumptions

- A: 検索は client-side フィルタ（Browser に一覧メタデータを渡す想定、credential 無し）。数千 Agent 規模なら server 検索へ昇格。本ワイヤーフレームは client-side を既定。
- Q: 登録フローで credential 参照は「既存参照の選択」と「新規参照の登録」のどちらも必要か。→ A: 両方サポート。新規参照登録も server-only で行い、Browser に生値を渡さない。
