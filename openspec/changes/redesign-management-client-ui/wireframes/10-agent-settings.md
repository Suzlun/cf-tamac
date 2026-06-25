# 10 — Selected-Agent: Settings（API・credential・model policy・一般設定）

## Intent & Users

- 顧客: 管理者。選択中 Agent の API/RPC 接続、credential 参照、model policy、一般設定を安全に管理・ローテーションしたい。
- 目的: Agent 単位の全設定をここに集約。`/settings`（Global Settings）とは別物。credential・model policy を server-only で安全に扱い、Browser には secret を渡さない（AGENT-MANAGEMENT-UI-S003/S004/S017/S018）。

## Route & URL

- `GET /agents/[agentId]/settings`

## Desktop layout (>= 1024px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CONTENT                                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ acme-prod-bot — エージェント設定                                  │ │ h1
│ ├───────────────────────────┬──────────────────────────────────────┤ │
│ │ セクション nav (in-content)│ 詳細 panel                            │ │
│ │ ◉ API と接続               │ ┌──────────────────────────────────┐ │ │
│ │ ○ 認証情報（credential）   │ │ API と接続                        │ │ │
│ │ ○ モデルポリシー           │ │ Agent ID: acme-prod-bot (等幅)    │ │ │
│ │ ○ 一般設定                 │ │ RPC origin: ...workers.dev (等幅) │ │ │
│ │ ○ 危険な操作               │ │ 接続状態: ●到達可能  最終確認 X前  │ │ │
│ │                            │ │ [接続を再検証]                    │ │ │
│ │                            │ └──────────────────────────────────┘ │ │
│ └───────────────────────────┴──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

- in-content secondary nav（sidebar を増やさない）。セクション:
  - **API と接続**: Agent ID, RPC origin, 接続状態, `接続を再検証`。origin 編集は慎重操作（managed Agent record 更新 = Client D1）。
  - **認証情報（credential）**: credential 参照（mask hint・status・generation）。`ローテーション`（server-only, secret 非表示）。新規参照登録/切替も server-only。
  - **モデルポリシー**: default model policy（policy ref, provider, model, digest, generation params, status, validation warning）。`検証`/`更新`。`UpdateConfig` に成功 policy ref のみ渡す（AGENT-MANAGEMENT-UI-S018）。
  - **一般設定**: 表示名・説明・pin・並び順・無効化（Client D1 の managed Agent metadata）。
  - **危険な操作**: Agent の無効化・managed Agent からの除外等。明示的確認必須。

## Mobile layout (< 1024px)

- in-content nav は dropdown。各セクションは縦 panel。

## Data & state contract（server-only 境界）

- API/接続・credential は server-side Agent RPC + Client D1（managed Agent record）。credential 値は mask hint のみ Browser へ。
- model policy は server-side Agent RPC（`UpsertModelPolicy`, `ValidateModelPolicy`, `UpdateConfig`）。Provider credential・生 token・raw prompt/completion/reasoning は Browser payload/HTML/JS/storage に含めない（AGENT-MANAGEMENT-UI-S017/S018）。
- Browser-visible module は Agent RPC client / Connect runtime / server-only factory / credential 解決ロジックを import しない。

## States

- **loading**: panel skeleton。
- **error（RPC 失敗）**: secret-safe。`設定の取得に失敗しました / 再試行`。
- **error（policy 検証失敗）**: 該当 field に secret-free な warning（`ポリシーが不正です: <抽象原因>`）。
- **permission-denied**: セクション/操作単位で disabled + tooltip。
- **optimistic（更新/ローテーション）**: `更新`/`ローテーション` disabled + pending。
- **success**: 更新後の config version/digest/generation を即時反映 + 成功 toast（secret 無し）。
- **missing binding**: `ポリシーの参照に失敗しました（バインディング不足）` 等、secret-safe な原因。
- **dangerous 操作確認**: 確認 dialog（type "critical"）。影響範囲明示。

## Copy slots（日本語）

- h1: `<Agent名> — エージェント設定`。
- セクション: `API と接続`, `認証情報`, `モデルポリシー`, `一般設定`, `危険な操作`。
- API: `Agent ID`, `RPC origin`, `接続状態`, `接続を再検証`, `到達可能`, `到達不可`。
- credential: `参照`, `状態`, `世代`, `ヒント`, `ローテーション`, `新規参照を登録`, `参照を切替`。
- model policy: `policy ref`, `Provider`, `Model`, `digest`, `生成パラメータ`, `状態`, `検証`, `更新`。
- 一般: `表示名`, `説明`, `ピン留め`, `並び順`, `無効化`。
- アクション: `保存`, `保存中…`, `再試行`, `キャンセル`。

## Accessibility

- in-content nav: `role="tablist"`/`tab`/`tabpanel` + arrow-key。`aria-current`。
- credential mask hint は `aria-label` で「マスク済み参照」を明示（secret を読み上げない）。
- 検証/更新エラーは `aria-describedby` で field 紐付け。
- dangerous dialog: focus-trap、破壊的ラベル明示。

## Integration notes for unit/client/engineer

- `packages/client/app/agents/[agentId]/settings/page.tsx`: セクション構成へ再設計。server action で model policy/credential/config（AGENT-MANAGEMENT-UI-S003/S004/S017/S018）。
- managed Agent metadata（表示名等）更新は既存 server action 群（`packages/client/src/server/actions/managed-agents.ts`）を再利用。新規操作も同所に集約（重複禁止: credo 4）。

## Open questions / assumptions

- A: model policy の「生成パラメータ」編集は安全な範囲の UI（temperature/max tokens 等）。Provider 固有の秘匿パラメータは server 側でのみ取り扱い、UI には抽象化された安全字段のみ。
- Q: credential ローテーションの具象（Agent 側 RPC）は別途。UI は server action の結果（新 generation）のみ反映する想定。
