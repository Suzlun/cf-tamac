# 11 — Cross-cutting: States, Copy, Accessibility, Security Boundaries

> 各画面ワイヤーフレームから参照される、横断的な状態モデル・コピースロット・アクセシビリティ・セキュリティ境界の一元定義。
> 各画面の States 節と重複する内容は、本ファイルが正とする（DRY: credo 4）。

## 1. 状態モデル（全画面共通の規範的状態）

各画面は以下を網羅する。状態遷移は明示的で、secret を漏らさない。

| 状態                      | 規範的表現                                                                    | 禁止事項                                                      |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `loading`                 | content shape を保つ skeleton。spinner 全画面化しない。                       | 暗黙の長時間空白。                                            |
| `empty`                   | 次に行うべき行動を含む actionable empty。                                     | 単なる「データがありません」で終わる。                        |
| `error`                   | secret-safe。原因（抽象化）と再試行/導線。                                    | 生スタックトレース・credential・内部アドレス・raw RPC error。 |
| `permission-denied`       | 抽象的理由 + 必要な権限/連絡先。                                              | 内部ロール名・認可ロジックの露出。                            |
| `disabled`                | 理由 tooltip/label 付きの無効化。                                             | 理由なしの単なる灰色。                                        |
| `optimistic/pending`      | 対象 control の無効化 + 進行表示。                                            | 二重送信可能状態。                                            |
| `selected-agent-required` | （selected-Agent area のみ）未選択時の専用 state + `エージェント一覧へ` CTA。 | hidden のみで案内ゼロ。                                       |
| `filter-empty`            | 検索/フィルタ結果ゼロ時の `フィルタを解除`。                                  | 空一覧と同じ表現で紛らわしい。                                |

### 1.1 ローディング表現の規範

- 一覧: card/tile の skeleton を grid に並べる（実際の layout を保つ）。
- 詳細: panel skeleton（ヘッダ部は即時表示できる管理メタデータのみ先行）。
- server action 実行中: 対象ボタンを disabled + `…中` ラベル。進行は linear progress または inline spinner（小）。

### 1.2 エラーコピーの規範（secret-safe）

全てのユーザー向けエラーは、以下のみを含む:

- 現象（例: `Agent との通信に失敗しました`）
- 次の一手（例: `再取得` / `エージェント設定を確認` / `時間をおいて再試行`）
- （管理者向け）抽象化された原因カテゴリ（例: `接続先が応答しませんでした`）。内部アドレス・credential・token は含めない。

### 1.3 楽観的更新の規範

- 権限のない副作用を含まない表示変更のみ楽観的に許可（例: pin toggle、選択切替）。
- Agent RPC を伴う操作（承認/却下、install/uninstall、schedule 作成/取消、config 更新）は server action 完了後に確定。進行中は対象 control のみ disabled し、他操作はブロックしない（UX 破綻を避ける）。失敗時は前状態へ復元 + secret-safe トースト。

## 2. グローバルコピースロット

- ブランド: `cf-tamac`
- 共通アクション: `再取得`, `再試行`, `もっと見る`, `もっと読み込む`, `キャンセル`, `保存`, `保存中…`, `削除`, `閉じる`, `戻る`, `詳細`, `編集`, `検索...`
- 共通状態語: `正常`, `実行中`, `待機中`, `一時停止`, `成功`, `失敗`, `承認待ち`, `承認済み`, `却下`, `有効`, `無効`, `不明`, `接続不可`, `到達可能`, `到達不可`, `整合`, `要確認`, `setup 未完了`, `インストール済み`, `アンインストール済み`, `初期化中`
- 危険操作の確認: `<操作> を実行しますか？この操作は元に戻せません。`
- 権限: `この操作には権限が必要です`, `権限がありません`
- 未選択ガイダンス（selected-Agent area）: `この画面にはエージェントの選択が必要です` / ボタン `エージェント一覧へ`

## 3. アクセシビリティ（横断要件）

### 3.1 構造とフォーカス

- 全画面に `skip-to-content` リンク（Tab 1 回で到達、`#main-content` へ）。
- フォーカス順序は DOM 順（視覚順序と一致）。`tabindex` 正の値は原則使わない。
- 全 interactivity は keyboard 到達可能。マウス専用の操作を許さない。
- モーダル/drawer/dialog: `role="dialog" aria-modal="true"`、focus trap、`Esc` close、起動元へ focus 復帰。

### 3.2 ランドマークとロール

- `header`（Topbar）、`nav`（Sidebar + in-content nav）、`main`（Content, `id="main-content"`）。
- master-detail: `listbox`/`option`（`aria-selected`）+ `region`（`aria-live="polite"`）。
- tabs: `tablist`/`tab`/`tabpanel`、arrow-key、`aria-selected`。
- 一覧: `list`/`listitem` または `grid`/`row`（card を `article` にすることも可）。

### 3.3 知覚可能性（色・アイコン・動的更新）

- 色・アイコン単独での情報伝達禁止。ステータスは色+アイコン+ラベルの3点セット。
- `aria-current="page"`（現在地）/ `aria-current="step"`（ステップ）/ `aria-pressed`（toggle）/ `aria-expanded`（折りたたみ・drawer）。
- 動的更新は `aria-live`（polite 既定、重要は assertive）。**secret・credential・内部アドレスは読み上げ・通知しない**。
- 構造化値（ID/key/timestamp/policy ref/digest）は等幅 + 文脈 `aria-label`。

### 3.4 国際化・タイムゾーン・日時

- 既定 `lang="ja"`（現状踏襲）。copy は日本語。
- 時刻は利用者のタイムゾーンで表示（Global Settings で切替可能）。絶対時刻と相対時刻を両提示（`title` 属性で絶対時刻）。

### 3.5 モーション

- `prefers-reduced-motion: reduce` で全装飾アニメ・遷移を無効化。進行表示は運動量に依存しない形状で示す。

## 4. セキュリティ境界（実装不変量・全画面）

以下は design-only であるが、`unit/client/engineer` が守るべき境界を明文化する。

1. **Browser bundle**: Agent credential・秘密鍵・生 token・Provider secret・raw 署名 material を含めない。`MANAGEMENT-CLIENT-S002`, `CLIENT-MANAGEMENT-S009`, `CLIENT-MANAGEMENT-S017` 準拠。
2. **Browser からの Agent RPC 直接呼出禁止**: 全 Agent RPC は Client server 側（Server Component / Server Action / server-only module）から生成済み Protobuf RPC client を用いて発生。Browser-visible module は `packages/client/src/generated/agent-rpc` / Connect runtime / server-only Agent RPC factory / credential 解決ロジックを import しない。
3. **No Agent API proxy route**: `/api/client/*`, `/api/agent*`, Agent REST proxy, 任意 RPC forwarding route を公開しない。`MANAGEMENT-CLIENT-S008` 準拠。
4. **Client D1 所有権**: managed Agent records・credential references のみ。Agent-domain snapshot 非保存。`MANAGEMENT-CLIENT-S003/S004` 準拠。全 Agent-owned 表示データは毎回 server 側 Agent RPC から取得。
5. **credential / policy 表示の安全化**: credential は mask hint のみ。model policy は policy ref/digest/provider/model/安全な generation params/status/validation warning のみ。Provider credential・Agent credential・生 token・raw prompt/completion/reasoning は Browser payload/HTML/JS/storage に含めない。`CLIENT-MANAGEMENT-S017/S018` 準拠。
6. **エラーの secret-safe 化**: 全 error/loading 状態で secret・生スタック・内部アドレスを漏らさない。`CLIENT-MANAGEMENT-S009` 準拠。

## 5. OpenSpec シナリオカバレッジへの指針（参考）

本ワイヤーフレーム群は design-only であり、delta spec のシナリオ採番は別フェーズ。実装時は以下既存 ID を直接参照し、新規が必要な箇所は新規シナリオ候補として扱う:

- 既存参照候補: `MANAGEMENT-CLIENT-S001/S002/S003/S004/S007/S008`, `CLIENT-MANAGEMENT-S001/S002/S003/S004/S005/S006/S007/S008/S009/S017/S018`
- 新規候補（ナビゲーション IA・Agent 選択状態マシン・Tools/Compactions 統合）は、`management-client`/`client-management` delta spec で `MANAGEMENT-CLIENT-S###`/`CLIENT-MANAGEMENT-S###` として採番すること。本ワイヤーフレームは採番しない（design-only 境界遵守）。
