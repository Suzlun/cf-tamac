# ブラウザー安全化 Agent登録・操作結果 UI仕様

- 変更名: `introduce-tamac-sdk`
- 設計担当: `unit/client/designer`
- 実装担当: `unit/client/engineer`
- 対象: `packages/client/**` Management Client
- 状態: OpenSpec契約を配置、文言、状態、アクセシビリティへ写像したUI設計成果物

## 1. 意図と対象利用者

### 意図

`/agents/new`の管理対象Agent登録と、Agent選択済みシェル内のAgent操作結果を、ブラウザー安全化済みの4フィールド`displayData`、`safeStatus`、`safeErrorCategory`、`correlationId`で一貫して伝える。Managed Agent登録では、同じattemptのreceipt、期待profile、期待configの完全一致を確認した場合だけ`active`成功を表示する。状態確認中は入力を保持して編集を一時停止し、`GetAgent`の`not_found`とClient cleanup postconditionを確認した場合は、保持入力を編集して新しいattemptを開始できる再登録可能状態を表示する。文言、配置、フォーカス、ライブ領域、エラー分類ごとの操作可否を本仕様で確定する。

### 対象利用者

| 利用者               | このUIで行うこと                                                     | UIが提供する支援                                                 |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Agent運用者          | 許可済みAgent RPC originで管理対象Agentを登録し、Agent設定を変更する | 成功状態、安全な結果、次の操作を明確に示す                       |
| セキュリティ担当者   | originポリシーとブラウザー／サーバー境界を確認する                   | 機密情報のサーバー専用所有境界とブラウザー結果の許可リストを示す |
| サポート・運用担当者 | 安全な分類とcorrelation IDでサーバー側ログを追跡する                 | 問い合わせID全文、コピー操作、コピー完了通知を提供する           |

## 2. 設計根拠と対応する完成状態

- SDK経由のServer Actionが返すブラウザー結果は、安全化済み表示データ、安全な状態、安全なエラー分類、correlation IDで構成される。登録結果が未確定の場合は同じidempotency contextで状態を確認し、receiptの両値、profile、configの完全一致を`active`確定条件とする: `openspec/changes/introduce-tamac-sdk/specs/tamac-sdk/spec.md:81-106`。
- `InitializeAgent`は`registration_request_digest`を必須入力とし、`GetAgent.initialization_receipt`は`idempotency_key`と`registration_request_digest`を返す。Management Clientは両値と期待profile/configを登録attemptへ照合する: `openspec/changes/introduce-tamac-sdk/specs/agent-lifecycle/spec.md:11-23`、`openspec/changes/introduce-tamac-sdk/specs/agent-lifecycle/spec.md:39-44`。
- 登録時とSDK通信経路の構築直前に、正規化済みHTTPS Agent RPC originをサーバー管理の許可リストで検証する: `openspec/changes/introduce-tamac-sdk/specs/tamac-sdk/spec.md:108-136`。
- `@cf-tamac/sdk`と生成済みRPC descriptorはサーバー側実行グラフが所有する: `openspec/changes/introduce-tamac-sdk/specs/workspace-governance/spec.md:36-79`。
- 登録フォームの確定階層は識別情報 → 既定モデルポリシー → credential参照 → 登録操作である: `packages/client/src/components/agent-registration-form.tsx:327-425`。
- 既定モデルポリシーの確定配置はAgent選択済み設定画面内で、概要／編集 → 汎用設定の順である: `packages/client/src/components/agent-settings-form.tsx:394-423`。
- 安全化結果の補助関数は状態、分類、correlation IDをブラウザー安全化済み結果オブジェクトへ投影し、機密エラー情報をサーバー専用の可観測性領域が所有する: `packages/client/src/server/agent-rpc/safe-results.ts:31-45`、`packages/client/src/server/agent-rpc/safe-results.ts:69-99`。

## 3. 画面・ルート・コンポーネント一覧

| 画面／領域                   | 役割                          | 確定配置                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/agents/new`                | 管理対象Agent登録             | `ControlRoomFrame`、識別情報、既定モデルポリシー、credential参照、登録操作の順。状態領域は`<form>`先頭、説明文の後、最初のフィールドの前。初期、状態確認が必要、active成功、再登録可能を同じ位置で切り替える。 |
| `/agents/[agentId]/settings` | Agent選択済み設定             | 既定モデルポリシーを代表Agent操作とする。操作結果領域は`既定モデルポリシーを編集`の説明直後、`ModelPolicyFields`の直前。概要は編集領域より前。                                                                 |
| `AgentRegistrationForm`      | 登録入力と状態制御            | ブラウザー内検証、登録処理中、状態確認が必要、状態確認中、active成功、再登録可能を4フィールド結果とUI内部pendingへ写像する。                                                                                   |
| `ModelPolicySettingsSection` | 既定モデルポリシー操作        | 処理中状態、結果表示、安全化済み`displayData`の概要反映、操作可否を扱う。                                                                                                                                      |
| サーバー専用処理             | ポリシー検証、登録、Agent操作 | SDK構築、originポリシー、credential／署名、生成済みdescriptor、正規化済みエラーを所有する。                                                                                                                    |

Agent選択済み範囲は`/agents/[agentId]`、代表操作画面は`/agents/[agentId]/settings`とする。Management Clientのルート構成はレジストリ／詳細シェルとServer Action境界で構成する。

## 4. ブラウザー安全化結果とUI状態モデル

### 4.1 4フィールドで閉じた結果

Server Action結果の最上位キー集合は次の4フィールドで閉じる。

| フィールド          | 対応値                             | UIでの用途                                           | 所有境界                   |
| ------------------- | ---------------------------------- | ---------------------------------------------------- | -------------------------- |
| `displayData`       | ルート固有の安全化済みオブジェクト | 安全な文言、メタデータ、フィールド関連付けを表示する | ブラウザー表示モデル       |
| `safeStatus`        | `succeeded` / `failed`             | 状態外観、文言、操作可否へ写像する                   | ブラウザー表示用の結果状態 |
| `safeErrorCategory` | 成功は`null`、失敗は安定分類       | 安全な結果文言と次の操作へ写像する                   | ブラウザー分岐値           |
| `correlationId`     | Browser-safeな完全識別子           | サーバー側ログとの照合、問い合わせIDコピーに使う     | 可観測性の関連付け         |

成功結果は4フィールドをすべて明示する。

```ts
{
  displayData: {
    /* ルート固有の安全な成功メタデータ */
  },
  safeStatus: 'succeeded',
  safeErrorCategory: null,
  correlationId: '{correlationId}',
}
```

失敗結果も同じ4フィールドを明示する。

```ts
{
  displayData: {
    /* 分類に対応する安全な見出し、本文、フィールド関連付け、操作メタデータ */
  },
  safeStatus: 'failed',
  safeErrorCategory: 'configuration',
  correlationId: '{correlationId}',
}
```

ブラウザー内の待機、フィールド検証、処理中状態はUI内部状態として扱い、Server Action完了時に4フィールド結果を適用する。

### 4.2 共通状態遷移

```text
初期
 ├─ Browser入力検証 ───────────> ValidationSummary ──> 入力修正 ──> 初期
 └─ Agentを登録 ──────────────> 登録処理中
                                      ├─ receipt・profile・config完全一致 ──> active成功
                                      ├─ 適用状態が未確定 ─────────────────> 状態確認が必要
                                      └─ 登録attempt前の安全な失敗 ────────> 入力保持の安全な結果
状態確認が必要
 └─ 登録状態を確認 ───────────> 状態確認中（同じattempt context）
                                      ├─ receipt・profile・config完全一致 ──> active成功
                                      ├─ GetAgent not_found・cleanup完了 ──> 再登録可能
                                      └─ destroyed・receipt missing・部分一致・query error ──> 状態確認が必要
再登録可能
 └─ 保持入力を確認・編集 ─────> Agentを再登録 ──> 登録処理中（新しいattempt context）
```

Agent登録済み状態、ポリシー参照、ダイジェスト、バージョン、設定バージョンはサーバー応答由来の`displayData`で確定する。`active`成功表示と概要更新は、server-only照合がreceiptの`idempotency_key`、`registration_request_digest`、期待profile、期待configの完全一致を確認し、`safeStatus="succeeded"`を返した後に行う。照合中は状態確認の外観、文言、操作を維持する。

### 4.3 登録結果の安全な表示状態

`RegistrationSubmitResult.displayData`は、登録結果を次の閉じた表示状態へ対応付ける`registrationOutcome`を持つ。attempt ID、`idempotency_key`、`registration_request_digest`、raw receiptはserver-only登録ledgerと照合処理が所有し、Browser表示は照合結果の要約と次の操作で構成する。

| `registrationOutcome`     | `safeStatus` | 意味                                                                                                                           | Browserの主要操作   |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `active`                  | `succeeded`  | receipt両値、期待profile、期待configの完全一致を確認済み                                                                       | `Agentの概要を開く` |
| `reconciliation_required` | `failed`     | `destroyed`、receipt missing、部分一致、query errorを含む確認済みresultを保持し、同じattempt contextで`GetAgent`照合を継続する | `登録状態を確認`    |
| `re_registration_ready`   | `failed`     | `not_found`とClient cleanup postconditionを確認済み                                                                            | `Agentを再登録`     |

`configuration`、`permission_denied`、Browser入力検証などは、既存の分類別文言とフィールド関連付けを表示状態として使う。

## 5. 共通の操作結果領域

### 5.1 DOM位置と構造

各フォーム内の同じ通知スロットに`ResultRegion`または`ValidationSummary`を置く。Server Actionのpending／完了は`ResultRegion`、Browser入力検証は`ValidationSummary`が担当し、一つの状態変更を一つの通知領域が伝える。

```text
操作説明
└─ 通知スロット
   ├─ ResultRegion（Server Action pending／完了）
   │  ├─ 処理中／成功／安全な結果の見出し
   │  ├─ 安全な本文
   │  ├─ 失敗時の問い合わせ参照
   │  │  ├─ ラベル: 問い合わせID
   │  │  ├─ correlationId全文
   │  │  └─ ボタン: 問い合わせIDをコピー
   │  └─ 分類別操作
   └─ ValidationSummary（Browser入力検証）
      ├─ 見出し: 登録内容を確認してください
      ├─ 安全な本文
      └─ 対応フィールドへのリンク一覧
フォームフィールド
フォーム操作
```

- 待機状態では通知スロットを高さ0で保持する。
- `correlationId`全文は等幅書体、選択可能、`overflow-wrap:anywhere`で表示する。
- 成功時は成功見出し、安全な本文、次の操作を表示する。
- 失敗時は`SupportReference`を表示する。
- コピーボタンは`type="button"`、44px以上の操作領域、アクセシブルネームを`問い合わせID {correlationId} をコピー`とする。
- コピー完了文言は`問い合わせIDをコピーしました。`。同じ`ResultRegion`内の独立した`role="status" aria-live="polite"`で一度通知する。
- Clipboard APIの利用可否に応じて、コピーボタンまたは`問い合わせIDを選択してコピーできます。`を表示する。ID本文は常に選択可能とする。

### 5.2 意味属性とライブ領域

| 状態                   | 通知担当            | 意味属性                                                                            | フォーカス                            |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| 登録／状態確認の処理中 | `ResultRegion`      | `role="status" aria-live="polite" aria-atomic="true"`。フォームに`aria-busy="true"` | 起点ボタンへ維持する                  |
| active成功             | `ResultRegion`      | `role="status" aria-live="polite" aria-atomic="true"`。結果見出しは`tabIndex={-1}`  | 完了後に結果見出しへ移す              |
| 安全な結果             | `ResultRegion`      | `role="alert" aria-atomic="true"`。結果見出しは`tabIndex={-1}`                      | 完了後に結果見出しへ移す              |
| 再登録可能             | `ResultRegion`      | `role="alert" aria-atomic="true"`。結果見出しは`tabIndex={-1}`                      | 状態確認完了後に結果見出しへ移す      |
| Browserフィールド検証  | `ValidationSummary` | `role="alert"`。各フィールド案内は`aria-describedby`                                | DOM順で最初の確認対象フィールドへ移す |

Server Action起点では`ValidationSummary`の表示状態をクリアしてから`ResultRegion`をpendingへ更新する。Browser入力検証起点では`ResultRegion`の表示結果をクリアして`ValidationSummary`を表示する。Server Actionがfield errorを返した場合は`ResultRegion`がalert通知を担当し、各フィールド直下の案内は`aria-describedby`で関連付ける。通知スロットは`ValidationSummary`または`ResultRegion`の常に一方だけを表示する。`role="alert"`がassertive通知を担当し、処理中／成功／コピー完了はpolite領域が担当する。

## 6. `/agents/new` 管理対象Agent登録

### 6.1 デスクトップ構造

```text
ManagementShell
├─ 固定サイドバー: グローバル > Agents選択中
└─ ControlRoomFrame
   ├─ 状態ラベル: 登録
   ├─ h1: Agentレジストリ › 新規登録
   └─ コンテンツ
      ├─ h2: サーバー側参照情報でAgentを登録します
      ├─ 説明文
      └─ フォーム
         ├─ 通知スロット: ResultRegion または ValidationSummary
         ├─ Agent ID
         ├─ Agent RPC origin
         ├─ 表示名
         ├─ 表示順（任意）
         ├─ 既定モデルポリシーfieldset
         ├─ credential参照details[open]
         └─ 操作: キャンセル / Agentを登録
```

ページ階層は状態ラベル、ページ見出し、コンテンツ見出しで構成する。既定モデルポリシーは`legend`と`作成時に有効`の状態文でセクションを示す。

デスクトップwireframeは同じroute shell内に次の4画面を縦方向のscreen inventoryとして配置する。各画面は最大960px、メイン領域は32px padding、フォーム内は24px paddingと16px／24px gapを使う。状態確認が必要な画面は入力保持領域をResultRegionの直後、active成功は照合済み登録内容をResultRegionの直後、再登録可能は編集可能な保持入力をResultRegionの直後に置く。

| 画面 | 最上位の状態情報                          | 本文領域                                   | 最終操作                                  |
| ---- | ----------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| 1    | `初期 — 入力可能`                         | 15フィールドの編集フォーム                 | `キャンセル` / `Agentを登録`              |
| 2    | `状態確認が必要 — 入力保持・編集一時停止` | ResultRegion、保持入力、状態確認中substate | `問い合わせIDをコピー` / `登録状態を確認` |
| 3    | `active — 完全一致を確認済み`             | ResultRegion、照合済み登録内容             | `Agentの概要を開く` / `Agent一覧に戻る`   |
| 4    | `再登録可能 — 入力保持・編集可能`         | ResultRegion、15フィールドの編集フォーム   | `キャンセル` / `Agentを再登録`            |

### 6.2 モバイル構造

- 390px想定でShadcn `Sheet`のナビゲーション起動ボタンを最上部に置く。サイドバー内容はシェル既定順で提供する。
- メイン領域は左右16px、上下24px。4画面はすべて1列で積む。
- フィールド順、`ValidationSummary`、`ResultRegion`の位置はデスクトップと同一。
- 既定モデルポリシーのフィールド順はポリシー参照 → プロバイダー → モデルID → 温度 → Top P → 最大出力トークン数 → ポリシー検証。
- 操作は本文末尾で`キャンセル`、主要操作`Agentを登録`の順。
- 長いorigin、モデルID、フィンガープリント、correlation IDは表示領域内で折り返す。
- 状態確認が必要な画面はResultRegion → 保持入力 → 状態確認中substate、active成功はResultRegion → 照合済み登録内容、再登録可能はResultRegion → 編集可能な保持入力 → 操作の順に積む。
- 主要操作は横幅をコンテンツに合わせ、44px以上の高さを確保する。390pxで文言が折り返す場合はボタン高を内容に合わせて拡張する。

### 6.3 ページ文言

| 箇所             | 確定文言                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 状態ラベル       | `登録`                                                                                                                                     |
| ページ見出し     | `Agentレジストリ › 新規登録`                                                                                                               |
| コンテンツ見出し | `サーバー側参照情報でAgentを登録します`                                                                                                    |
| 説明文           | `Agent ID、許可済みのHTTPS Agent RPC origin、表示名を入力します。credentialフィールドはサーバー側検索参照と公開メタデータを受け付けます。` |
| 主要操作         | `Agentを登録`                                                                                                                              |
| 副操作           | `キャンセル`                                                                                                                               |

### 6.4 フィールド文言と順序

| フィールド                    | ラベル                   | 補足文／状態文                                                                                                                        |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `agentId`                     | `Agent ID`               | `Durable Object名。小文字のkebab-caseで入力してください。`                                                                            |
| `agentRpcOrigin`              | `Agent RPC origin`       | `運用ポリシーで許可された正規HTTPS originを入力してください（例: https://agent.example.com）。scheme、host、任意のportで構成します。` |
| `displayName`                 | `表示名`                 | `Agentレジストリと概要に表示します。`                                                                                                 |
| `displayOrder`                | `表示順（任意）`         | `同じpin groupでは小さい番号を先に表示します。`                                                                                       |
| `modelPolicy.policyRef`       | `ポリシー参照`           | `AgentConfig.modelPolicyRefで参照するAgent所有ID。小文字のkebab-caseで入力してください。`                                             |
| `modelPolicy.provider`        | `プロバイダー`           | `この画面ではworkers-aiを選択できます。Provider credentialはサーバー側が所有します。`                                                 |
| `modelPolicy.model`           | `モデルID`               | `Workers AI model ID。保存前にAgentが利用可否を検証します。`                                                                          |
| `modelPolicy.temperature`     | `温度`                   | `0.00〜2.00。小さい値ほど出力が安定します。`                                                                                          |
| `modelPolicy.topP`            | `Top P`                  | `0.01〜1.00のnucleus sampling上限です。`                                                                                              |
| `modelPolicy.maxOutputTokens` | `最大出力トークン数`     | `1回のmodel callで返すtoken数を1〜8192で指定します。`                                                                                 |
| ポリシー状態                  | `既定モデルポリシー`     | `作成時に有効` / `初期の既定ポリシーにはactive状態を使用します。`                                                                     |
| `referenceValue`              | `credential参照`         | `サーバー側secret resolverが使用するopaque参照を入力します。`                                                                         |
| `keyId`                       | `キーID`                 | `credentialを識別する公開キーIDです。`                                                                                                |
| `publicFingerprint`           | `公開フィンガープリント` | `Agent公開鍵のフィンガープリントを入力します。`                                                                                       |
| `maskedHint`                  | `マスク済みヒント`       | `例: ed25519:ab…12。masked identifierを入力します。`                                                                                  |
| `status`                      | `状態`                   | 選択肢は`active`、`pending`、`rotating`                                                                                               |

credential参照のセクション説明は`Clientは参照値、キーID、公開フィンガープリント、マスク済みヒント、状態を管理します。秘密情報の解決処理とcredential情報はサーバー側が所有します。`とする。

### 6.5 フィールド検証文言

| 検証対象                     | 確定案内文                                                        |
| ---------------------------- | ----------------------------------------------------------------- |
| Agent ID必須                 | `Agent IDを入力してください。`                                    |
| Agent ID形式                 | `Agent IDは63文字以内の小文字kebab-caseで入力してください。`      |
| HTTPS origin形式             | `有効なHTTPS Agent RPC originを入力してください。`                |
| 正規origin形式               | `scheme、host、任意のportで構成されたoriginを入力してください。`  |
| 表示名の長さ                 | `表示名を1〜80文字で入力してください。`                           |
| 表示順の形式                 | `表示順は0以上の整数で入力してください。`                         |
| ポリシー参照形式             | `ポリシー参照は64文字以内の小文字kebab-caseで入力してください。`  |
| プロバイダー許可リスト       | `プロバイダーはworkers-aiを選択してください。`                    |
| モデルID形式                 | `モデルIDは160文字以内のmodel identifier形式で入力してください。` |
| 温度範囲                     | `温度は0.00〜2.00の範囲で、小数第2位まで入力してください。`       |
| Top P範囲                    | `Top Pは0.01〜1.00の範囲で、小数第2位まで入力してください。`      |
| 最大出力トークン数範囲       | `最大出力トークン数は1〜8192の整数で入力してください。`           |
| credential参照の長さ         | `credential参照を1〜512文字で入力してください。`                  |
| キーIDの長さ                 | `キーIDを1〜128文字で入力してください。`                          |
| 公開フィンガープリントの長さ | `公開フィンガープリントを1〜128文字で入力してください。`          |
| マスク済みヒントの長さ       | `マスク済みヒントを1〜64文字で入力してください。`                 |
| 状態許可リスト               | `状態はactive、pending、rotatingのいずれかを選択してください。`   |

`ValidationSummary`:

- 見出し: `登録内容を確認してください`
- 本文: `強調表示されたフィールドを確認すると登録を続行できます。`
- 一覧形式: `{フィールドラベル}: {フィールド案内}`
- 各項目は対応フィールドの`id`へ移動するリンクとし、クリック／Enterでそのフィールドへフォーカスする。

### 6.6 登録状態

| 状態                          | `ResultRegion` / `ValidationSummary` | 確定文言                                                                                                                                                                                                                                                                   | フィールド状態                                                                     | 操作状態                                                                              |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 初期                          | 通知スロットは高さ0                  | ポリシー状態`初期の既定ポリシーにはactive状態を使用します。`                                                                                                                                                                                                               | 15フィールドを編集可能                                                             | `ポリシーを検証`、`キャンセル`、`Agentを登録`を有効                                   |
| Browserフィールド検証         | `ValidationSummary`が`role="alert"`  | 見出し`登録内容を確認してください`、本文`強調表示されたフィールドを確認すると登録を続行できます。`、§6.5の一覧                                                                                                                                                             | 全フィールドを編集可能。最初の確認対象へfocus                                      | `ポリシーを検証`、`キャンセル`、`Agentを登録`を有効                                   |
| 登録処理中                    | `ResultRegion`が`role="status"`      | 見出し`Agentを登録しています`、本文`登録情報を確認し、Agentを初期化しています…`、起点ボタン`Agentを登録しています…`                                                                                                                                                        | 全フィールドの編集を一時停止                                                       | 起点ボタンは`aria-disabled="true"`でfocusを維持。ほかの登録操作も一時停止             |
| 状態確認が必要                | `ResultRegion`が`role="alert"`       | 見出し`登録状態を確認してください`、本文`入力内容を保持し、同じ登録試行のreceipt、profile、設定をAgent側の状態と照合します。「登録状態を確認」を実行してください。`、補足`登録状態の確認中は入力の編集を一時停止しています。`                                              | 全15フィールドの値を表示し、mutation fieldsをlock                                  | `問い合わせIDをコピー`と唯一の確認action`登録状態を確認`を有効                        |
| 状態確認中                    | `ResultRegion`が`role="status"`      | 見出し`登録状態を確認しています`、本文`同じ登録試行のreceipt、profile、設定をAgent側の状態と照合しています…`、起点ボタン`確認しています…`                                                                                                                                  | 全15フィールドの値を表示し、編集を一時停止                                         | `登録状態を確認`は`aria-disabled="true"`でfocusを維持。フォームは`aria-busy="true"`   |
| 状態確認error                 | `ResultRegion`が`role="alert"`       | 見出し`登録状態を確認してください`、本文`確認済みの結果と入力内容を保持しています。問い合わせIDを控え、同じ登録試行の状態確認を続けてください。`                                                                                                                           | `destroyed`、missing receipt、部分一致、query errorの各結果でmutation fieldsをlock | `問い合わせIDをコピー`と唯一の確認action`登録状態を確認`を有効                        |
| active成功                    | `ResultRegion`が`role="status"`      | 見出し`Agentを登録しました`、本文`「{displayName}」のreceipt、profile、設定が登録試行と一致し、管理対象として登録されました。`、要約`照合結果: 登録試行と一致`、`登録状態: active`                                                                                         | 送信内容を`照合済み登録内容`の読み取り表示で確認可能                               | 主要操作`Agentの概要を開く`、副操作`Agent一覧に戻る`を有効                            |
| 再登録可能                    | `ResultRegion`が`role="alert"`       | 見出し`Agentを再登録できます`、本文`Agent側で対象Agentが見つからず、Client側の登録試行データの整理が完了しました。入力内容を保持しています。必要に応じて編集し、「Agentを再登録」で新しい登録試行を開始してください。`、補足`次の登録は新しい登録試行として実行されます。` | 保持した全15フィールドを編集可能。Agent IDを含む入力順を初期状態と同じにする       | `問い合わせIDをコピー`、`ポリシーを検証`、`キャンセル`、主要操作`Agentを再登録`を有効 |
| originポリシー`configuration` | `ResultRegion`が`role="alert"`       | 見出し`Agent RPC originを確認してください`、本文`Agent RPC originを運用ポリシーで確認してください。許可済みのHTTPS originを登録すると操作を続行できます。`、フィールド案内`許可済みのHTTPS Agent RPC originを入力してください。`                                           | 入力値を保持し、Agent RPC originを編集可能                                         | `問い合わせIDをコピー`、`キャンセル`、`Agentを登録`を有効                             |
| 署名前提`configuration`       | `ResultRegion`が`role="alert"`       | 見出し`登録前の設定を確認してください`、本文`グローバル設定で既定のClient Service signing keyを生成して選択すると、Agent登録を続行できます。`、リンク`グローバル設定を開く`                                                                                                | 入力値を保持し、全フィールドを編集可能                                             | `グローバル設定を開く`、`キャンセル`、`Agentを登録`を有効                             |
| 権限案内                      | `ResultRegion`が`role="alert"`       | 見出し`Agent登録の権限を確認してください`、本文`Agent登録には管理権限を使用します。運用管理者が権限を確認できます。`                                                                                                                                                       | 入力値を保持し、全フィールドを読み取り可能                                         | `問い合わせIDをコピー`と`キャンセル`を有効                                            |

ルート読み込み中はページシェル、通知スロット、フィールドラベル位置を保つスケルトンを使う。スケルトンはラベルと形状で構成し、`aria-busy="true"`をメイン領域へ設定する。登録処理は照合完了まで状態確認表示を維持し、Server Action由来の`displayData.registrationOutcome`で画面状態を決定する。

## 7. Agent選択済み操作結果

### 7.1 代表操作と配置

代表操作は`/agents/[agentId]/settings`の`既定ポリシーを保存`とする。Agent選択済みサイドバー、ページヘッダー、ポリシー概要、ポリシー編集、汎用設定、credential、危険操作領域の順で構成する。

```text
ManagementShell
├─ Agent選択済みサイドバー: 設定を選択中
└─ ControlRoomFrame
   ├─ 状態ラベル: 設定
   ├─ h1: Agentレジストリ › {agentId}
   └─ コンテンツ
      ├─ 見出し: Agent設定とcredential
      ├─ AgentToken + 説明文
      ├─ 既定モデルポリシー概要
      ├─ 既定モデルポリシーを編集
      │  ├─ 導入文
      │  ├─ ResultRegion
      │  ├─ ModelPolicyFields
      │  └─ 操作: ポリシーを検証 / 既定ポリシーを保存
      ├─ Agent設定
      ├─ credentialローテーション
      └─ 危険操作領域
```

デスクトップは2列のポリシーフィールド、モバイルは1列とする。`ResultRegion`は導入文と最初のフィールドの間に置く。

### 7.2 ページ／編集領域文言

| 箇所             | 確定文言                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 状態ラベル       | `設定`                                                                                                                                |
| ページ見出し     | `Agentレジストリ › {agentId}`                                                                                                         |
| コンテンツ見出し | `Agent設定とcredential`                                                                                                               |
| 説明文           | `「{displayName}」を管理しています。変更はサーバー側Agent RPCを通じて送信されます。`                                                  |
| 概要見出し       | `既定モデルポリシー`                                                                                                                  |
| 編集見出し       | `既定モデルポリシーを編集`                                                                                                            |
| 編集説明         | `Agent所有ポリシーを保存してから、保存済みの参照をAgentConfig.modelPolicyRefへ適用します。ブラウザーには安全化済みの結果を返します。` |
| 検証操作         | `ポリシーを検証`                                                                                                                      |
| 保存操作         | `既定ポリシーを保存`                                                                                                                  |

### 7.3 操作状態

| 状態                 | `safeStatus` / 分類                      | 確定文言と配置                                                                                                                                                                                                     | 操作可否                                                                                            |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 読み込み中           | UI内部状態                               | ポリシー概要はラベルスケルトン。`ResultRegion`は高さ0。                                                                                                                                                            | 編集領域は読み込み中の操作状態                                                                      |
| 設定案内             | UI内部状態                               | 概要`既定モデルポリシーを設定すると、EventsからのRunsでactiveなWorkers AI policyを利用できます。`                                                                                                                  | 編集領域の初期値から操作可能                                                                        |
| 入力検証             | 内部状態または`invalid_argument`         | 見出し`ポリシーの入力内容を確認してください`、本文`強調表示されたフィールドを確認するとポリシー検証を続行できます。`                                                                                               | 最初の確認対象フィールドへフォーカス                                                                |
| 処理中               | 結果待機中                               | 見出し`既定モデルポリシーを保存しています`、本文`ポリシーを保存し、Agent設定へ適用しています…`、保存ボタン`保存しています…`                                                                                        | ポリシーフィールドと設定変更操作は処理中の操作状態                                                  |
| 成功                 | `succeeded` / `null`                     | 見出し`既定モデルポリシーを保存しました`、本文`「{policyRef}」を保存し、設定バージョン v{configVersion} を適用しました。`                                                                                          | 安全化済み`displayData`で概要を更新。成功メッセージを表示                                           |
| 権限案内             | `failed` / `permission_denied`           | 見出し`更新権限を確認してください`、本文`既定モデルポリシーの更新には管理権限を使用します。安全なメタデータを確認できます。`                                                                                       | 概要を表示。編集領域は権限確認状態。問い合わせIDを表示                                              |
| 設定案内             | `failed` / `configuration`               | 見出し`Agentの接続設定を確認してください`、本文`Agent RPC originを運用ポリシーで確認してください。許可済みのHTTPS originを登録すると操作を続行できます。`、リンク`登録情報を編集`                                  | ポリシーフィールドは参照表示。`/agents/new?edit={agentId}`へ移動可能。問い合わせIDを表示            |
| 状態確認が必要な結果 | `failed` / `internal`または`unavailable` | 見出し`適用状態を確認してください`、本文`設定の適用状態をサーバー側で確認します。直前に確認済みの概要と入力内容を保持しています。問い合わせIDを控え、「適用状態を確認」を実行してください。`、操作`適用状態を確認` | 入力値と直前に確認済みの概要を保持。同じidempotency contextによる状態確認が可能。問い合わせIDを表示 |
| 同時操作             | UI内部状態                               | 補足文`進行中の操作が完了すると既定モデルポリシーを変更できます。`                                                                                                                                                 | ポリシー変更操作は処理中の操作状態                                                                  |

`permission_denied`、`configuration`、`internal`の`ResultRegion`には次を置く。

- ラベル: `問い合わせID`
- 値: `{correlationId}`
- ボタン: `問い合わせIDをコピー`
- 補足文: `このIDを運用担当者へ伝えると、サーバー側ログを安全に照合できます。`

ブラウザー文言の許可リストは見出し、安全な本文、問い合わせID、コピー完了通知、分類別操作で構成する。技術的実行情報はサーバー専用の可観測性領域が所有し、`safeErrorCategory`はブラウザー文言の対応付けに使う。

### 7.4 成功時の安全なメタデータ

`displayData`の表示許可リスト:

- `policyRef`
- `digest`
- `provider`
- `model`
- `version`
- `status`
- `configVersion`
- 安全化済み生成パラメーター
- 安全化済み警告

各値はサーバー応答由来とする。ルート再取得完了までは直前の概要を保持し、`ResultRegion`が成功を伝える。

## 8. キーボード、フォーカス順、アクセシビリティ

### 8.1 共通シェル

1. `メインコンテンツへ移動`
2. デスクトップのサイドバーナビゲーション、またはモバイルのナビゲーション起動ボタン
3. ページ主見出し
4. ページ内操作

モバイル`Sheet`はフォーカストラップ、Escapeで閉じる動作、起動ボタンへのフォーカス復帰を提供する: `packages/client/src/components/management-shell.tsx:25-47`。

### 8.2 `/agents/new`のフォーカス順

1. Agent ID
2. Agent RPC origin
3. 表示名
4. 表示順
5. ポリシー参照
6. プロバイダー
7. モデルID
8. 温度
9. Top P
10. 最大出力トークン数
11. ポリシーを検証
12. credential参照
13. キーID
14. 公開フィンガープリント
15. マスク済みヒント
16. 状態
17. キャンセル
18. Agentを登録

- Enterはフォーム送信を行い、ブラウザー内検証とサーバー検証を順番に実行する。
- `details`内の`summary`はEnter／Spaceで開閉でき、初期状態は展開。
- Browser入力検証では`ValidationSummary`だけがalertを担当し、DOM順で最初の確認対象フィールドへフォーカスする。
- Server Action完了では`ResultRegion`だけが通知を担当し、成功、安全な結果、再登録可能のいずれも`tabIndex={-1}`を持つ結果見出しへフォーカスする。
- 状態確認が必要な結果では、見出しフォーカス後のTab順を`問い合わせIDをコピー` → `登録状態を確認`とする。編集を一時停止したフィールドと登録操作はTab順から外す。
- `登録状態を確認`実行中は起点ボタンをDOMに維持し、`aria-disabled="true"`と重複実行ガードを適用してfocusを保持する。完了後は新しい結果見出しへfocusを移す。
- `destroyed`、missing receipt、receipt/profile/config部分一致、query errorの完了後は確認済みresult、correlation ID、保持入力を同じ`ResultRegion`へ再表示し、次のTab順を`問い合わせIDをコピー` → `登録状態を確認`とする。
- active成功では`Agentを登録しました`の見出しへフォーカスし、その後`Agentの概要を開く`、`Agent一覧に戻る`の順にTab移動する。
- 再登録可能では`Agentを再登録できます`の見出しへフォーカスし、その後`問い合わせIDをコピー`、Agent IDから始まる初期状態と同じフィールド順、`キャンセル`、`Agentを再登録`の順にTab移動する。

### 8.3 ポリシー編集のフォーカス順

1. ポリシー参照
2. プロバイダー
3. モデルID
4. 温度
5. Top P
6. 最大出力トークン数
7. ポリシーを検証
8. 既定ポリシーを保存

安全な結果の完了時は`tabIndex={-1}`を持つ結果見出しへフォーカスし、次のTabで問い合わせIDコピー、分類別操作、元のフィールドへ進める。処理中はフォーカスを登録／保存ボタンに維持する。

### 8.4 視覚アクセシビリティ

- 登録routeとwireframe previewは、TAMACの制御・照合用途に合わせたmineral teal基調のtinted neutral paletteを使う。ライトテーマは背景`#F3F7F7`、surface`#FFFFFF`、前景`#142A2E`、補助前景`#35535A`、主要色`#0A666A`、主要色前景`#FFFFFF`、border`#B8CBCD`とする。
- 状態面は状態語と併用する。状態確認は背景`#FFF3D6`／前景`#684508`／border`#D39A2C`、active成功は背景`#E3F3E9`／前景`#155B34`／border`#77A989`、再登録可能は背景`#E5F0F6`／前景`#1B4664`／border`#789CBD`とする。
- ダークテーマは背景`#0F2024`、前景`#EAF4F4`、補助前景`#B8CDD0`、主要色`#67CED0`、主要色前景`#082325`を使う。状態前景／背景はactive`#B8E7C9`／`#163B29`、状態確認`#FFE0A3`／`#493714`、再登録可能`#C7E5FA`／`#17354B`とする。
- UI本文、見出し、ラベル、ボタンは`IBM Plex Sans JP` 400/500/700を使い、`BIZ UDPGothic`、`Noto Sans JP`、sans-serifの順でfallbackする。問い合わせIDなどの識別子は`IBM Plex Mono`、`BIZ UDGothic`、monospaceの順とする。wireframe HTMLは同じfont stackを使う。
- 成功／安全な結果／処理中は見出しと本文を必ず表示し、状態色とテキストを組み合わせる。
- テキストのコントラストは通常テキスト4.5:1以上、大きいテキスト3:1以上。色付き背景上のテキストは背景色と同系統の高コントラスト前景色を使う。
- 入力欄／ボタンの操作領域は44px以上。視認可能なフォーカスリングを提供する。
- 編集一時停止状態は`編集一時停止`の状態文、tinted control背景、`disabled`または`aria-disabled` semanticsを組み合わせる。保持値の文字色は4.5:1以上を維持する。
- 長いIDは折り返し、全文を本文へ表示する。
- ライト／ダークの双方で上記の意味トークンを使用する。
- 状態遷移は150〜200ms以内のease-outを使用し、`prefers-reduced-motion`では即時反映する。

## 9. 所有境界と閉じた通信境界

### ブラウザー表示領域の所有境界

- フォーム入力
- 安全化済み`displayData`
- `safeStatus`
- `safeErrorCategory`
- Browser-safeな`correlationId`
- Server Actionコールバック
- 見出し、本文、問い合わせ参照、コピー完了通知、安全化済みメタデータ

### サーバー専用の所有境界

- `@cf-tamac/sdk`
- Connectランタイム
- 生成済みAgent RPC descriptor
- Agent RPCクライアント／通信経路の構築
- Agent RPC originポリシー設定
- credential検索、署名コンテキスト、秘密JWK、暗号化済み秘密JWK、JWT
- 正規化済みSDK／Connectエラー、stack、cause、request／response
- Client D1リポジトリ
- 可観測性ログ

### 対応する呼び出し境界

- ブラウザー表示用ClientコンポーネントはServer Actionコールバックを呼ぶ。
- Server Actionはサーバー専用アダプターへ委譲する。
- サーバー専用アダプターはoriginポリシー、credential、acting-userコンテキストを解決してSDKを構築する。
- ブラウザー結果マッパーは4フィールドで閉じた結果を返す。
- Management Client App Routerはレジストリ／詳細ルートシェルで構成する。

## 10. `unit/client/engineer`への実装引き渡し

### 10.1 `/agents/new`

- `packages/client/app/agents/new/page.tsx`: 4フィールドで閉じた登録結果を返すsubmit callbackと、同じserver-only attemptを`GetAgent`で照合するreconciliation callbackを`AgentRegistrationForm`へ渡す。App RouterはServer Action callbackだけをClient Componentへ渡す。
- `packages/client/src/components/schemas/agent-registration.ts`: `RegistrationSubmitResult.displayData`へ`registrationOutcome?: 'active' | 'reconciliation_required' | 're_registration_ready'`を追加する。Browser向け型は照合結果と次操作だけを表し、attempt identityはserver-only stateとして扱う。
- `packages/client/src/components/agent-registration-form.tsx`: 説明文後・最初のフィールド前に単一の通知スロットを置く。`registrationOutcome`を§6.6の画面へ写像し、`reconciliation_required`では保持入力の編集を一時停止、`re_registration_ready`では全入力を再度編集可能、`active`では照合済み登録内容と遷移操作を表示する。
- `packages/client/src/components/agent-registration-form.tsx`: Browser入力検証用stateとServer Action結果用stateを分ける。Browser入力検証時は`operationResult`をクリアして`ValidationSummary`だけを表示し、Server Action開始時はBrowser validation summaryをクリアして`ResultRegion`だけをpending／完了通知に使う。Server Action由来のfield errorはResultRegionのalertと各フィールド直下の案内へ反映する。
- `packages/client/src/components/agent-registration-form.tsx`: `登録状態を確認`は`agentId`を手がかりにserver-only ledgerの同じattemptを照合する。`Agentを再登録`は現在の保持入力を通常submitへ渡し、server-only境界で新しいattempt contextを作る。
- `packages/client/src/components/agent-registration-actions.tsx`: 初期は`Agentを登録`、登録処理中は`Agentを登録しています…`、状態確認が必要／状態確認errorは`登録状態を確認`、再登録可能は`Agentを再登録`、active成功は遷移actionを表示する。
- `packages/client/src/components/operation-result-region.tsx`: Server Action完了ごとに、`tabIndex={-1}`の結果見出しへfocusする。submit結果とreconciliation結果が同じcorrelation IDを共有する場合も、`registrationOutcome`または完了sequenceをeffect dependencyとして扱い、状態確認完了時のfocusを確実に実行する。
- `packages/client/src/server/actions/managed-agents.ts`: 登録と初期化をサーバー側に集約し、結果を4フィールド結果へ投影する。
- `packages/client/src/server/actions/managed-agents.ts`: server-only outcomeの`active`、`reconciliation_required`、`not_found`＋Client cleanup postcondition確定を、上記`registrationOutcome`と§6.6の固定文言へ写像する。再登録可能の主要操作が新しいattemptを開始できるよう、cleanup完了結果を`re_registration_ready`として返す。
- `packages/client/src/server/actions/managed-agent-registration.ts`: 正規HTTPS originとサーバー管理の許可リストをClient D1書き込み前に検証する。SDK通信経路の構築時にも同じポリシーを適用する。
- `packages/client/src/server/actions/managed-agent-registration-attempt.ts`: `GetAgent.initialization_receipt.idempotency_key`、`registration_request_digest`、期待profile、期待configの完全一致を`active`確定条件として扱う。`not_found`とClient cleanup postconditionの双方が確定した結果を再登録可能へ渡し、`destroyed`、missing receipt、各部分一致、query errorは確認済みresult付き`reconciliation_required`へ渡す。
- `packages/client/src/server/agent-rpc/safe-results.ts`: 登録とAgent操作へ共通の4フィールド結果契約を提供する。

Browser-visible moduleはServer Action callbackとsafe display stateを所有する。SDK client construction、Agent RPC origin policy、Client D1、credential参照の解決、private／encrypted JWK、raw JWT、attempt ID、`idempotency_key`、`registration_request_digest`、raw receipt、generated RPC descriptorは`packages/client/src/server/**`が所有する。通信はServer Action → server-only adapter → Agent RPCの順で閉じ、Client route graphはレジストリ／詳細shellとServer Action境界で構成する。

### 10.2 既定モデルポリシー操作

- `packages/client/app/agents/[agentId]/settings/page.tsx`: Agent選択済みセクション順と安全化済み概要データを提供する。
- `packages/client/src/components/agent-settings-form.tsx`: 既定ポリシー結果の通知責務を`ModelPolicySettingsSection`へ集約する。
- `packages/client/src/components/model-policy-settings-section.tsx`: 導入文直後・フィールド直前に`ResultRegion`を置き、§7.3の分類対応、フォーカス、操作状態、問い合わせ導線を実装する。
- `packages/client/src/components/model-policy-fields.tsx`: 視認可能なラベル、補足文／案内文の関連付け、処理中／権限／設定の操作状態を受ける。
- `packages/client/src/components/schemas/model-policy.ts`: 4フィールド結果型を定義し、安全化済みポリシーメタデータを`displayData`に格納する。
- `packages/client/src/server/actions/agent-operations/default-model-policy.ts`: 成功／失敗を4フィールド結果へ投影し、`configuration`、`permission_denied`、`internal`を安定分類として返す。成功では`safeErrorCategory: null`を返す。
- `packages/client/src/server/actions/model-policies.ts`: サーバー専用の正規化処理と安全化済み表示マッパーを所有する。
- `packages/client/src/server/agent-rpc/safe-results.ts`: correlation ID必須のfail-closed方式で結果を構築する。

### 10.3 共通UI提案

登録とポリシー編集は`ResultRegion`の意味属性、問い合わせ行、コピー完了通知を同じコンポーネント契約で共有する。共通Client UIプリミティブの実装タスクでは、本仕様§5を単一の正本として使う。

### 10.4 テスト観点

- 成功／失敗の結果キー集合が`displayData`、`safeStatus`、`safeErrorCategory`、`correlationId`で構成されること。
- 成功が`safeErrorCategory: null`を持つこと。
- `configuration`結果の`displayData`が固定安全文言とフィールド関連付けを持つこと。
- `permission_denied`、`configuration`、`internal`でcorrelation ID全文、コピー用アクセシブルネーム、コピー完了ライブ領域があること。
- 処理中、成功、安全な結果、フィールド検証後のフォーカス位置。
- receipt両値、期待profile、期待configの完全一致結果がactive成功へ対応し、各部分一致結果は`registrationOutcome='reconciliation_required'`へ対応すること。
- 状態確認が必要な画面で全入力値が保持され、編集操作が一時停止し、主要操作が`登録状態を確認`になること。
- 状態確認中に同じattempt contextを使用し、起点ボタンへfocusを維持して単一実行状態を保つこと。
- `not_found`とClient cleanup postconditionが確定した結果で`registrationOutcome='re_registration_ready'`となり、保持入力が編集可能、主要操作が`Agentを再登録`になること。
- `destroyed`、missing receipt、profile/config/receipt部分一致、query errorで確認済みresultとcorrelation IDが保持され、mutation fields/actionsがlockされ、唯一の確認actionが`登録状態を確認`になること。
- `Agentを再登録`が新しいattempt contextを開始すること。Browser payloadには安全な`registrationOutcome`と固定文言を含める。
- Server Action完了では`ResultRegion`、Browser入力検証では`ValidationSummary`だけが通知意味属性を持つこと。
- submit結果と状態確認結果が同じcorrelation IDでも、状態確認完了時に結果見出しへfocusすること。
- Chromium、Firefox、WebKitの設定済みprojectで、状態確認完了後の結果見出しfocus、通知領域相互排他、次actionへのTab continuityが一致すること。
- モバイルで表示領域内の折り返し、44px操作領域、DOM順が保たれること。
- ブラウザーバンドル分類がブラウザー表示許可リストとサーバー専用所有境界に一致すること。
- ルートマニフェストがレジストリ／詳細シェルで構成されること。

## 11. UI品質判定

### Impeccable

- ローカル検出器の対象: `wireframes/managed-agent-registration-desktop.wireframe.html`、`wireframes/managed-agent-registration-mobile.wireframe.html`。更新後の検出結果を`[]`とする。
- 手動判定: `PASS`。画面状態は単一routeの時系列screen inventoryとしてdividerで分節する。ResultRegion、保持入力、照合済み内容、編集フォームは各状態で必要な要素を持つ。
- 手動判定: `PASS`。全周1px border、意味背景、単一surface階層、標準テキスト表現で構成し、各要素の視覚的な重みを機能的重要度へ合わせる。
- 手動判定: `PASS`。本文書体を`IBM Plex Sans JP`、識別子を`IBM Plex Mono`へ固定し、製品固有の可読性を持つtypographyへ揃える。
- 手動判定: `PASS`。mineral tealのtinted neutral paletteと状態別の同系統前景を使う。主要色上の白文字は6.73:1、状態確認は7.79:1、active成功は7.08:1、再登録可能は8.60:1のコントラストを持つ。
- 手動判定: `PASS`。動きは150〜200msのexponential ease-outで状態変化を伝える。`prefers-reduced-motion`では即時反映する。

### design-auditの段階別評価

| 監査面               | 手動結果 | 根拠                                                                                                      |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| 視覚階層             | PASS     | 各画面は状態見出し → ResultRegion／フォーム → 一つの主要操作の順で読む。                                  |
| spacing／rhythm      | PASS     | 8px gridを使い、screen 32px、section 24px、component 16px、内部12px／8pxの順で関係を表す。                |
| typography           | PASS     | `IBM Plex Sans JP`の3 weightと`IBM Plex Mono`の識別子用途へ限定する。                                     |
| color／contrast      | PASS     | tinted neutralと状態別同系統前景を使い、本文／状態面はWCAG AAを上回る。                                   |
| alignment／grid      | PASS     | デスクトップは240px sidebar＋960px content、モバイルは390pxの1列とし、同じ左端へ揃える。                  |
| component一貫性      | PASS     | 同じ通知スロット、ResultRegion、SupportReference、44px controlを全状態で共有する。                        |
| iconography          | PASS     | shell操作は現行icon set、登録状態は見出しと状態語を主要表現として使う。                                   |
| motion               | PASS     | 150〜200ms exponential ease-outとreduced-motion時の即時反映を使う。                                       |
| 初期／loading／error | PASS     | 高さ0の初期通知スロット、ラベルスケルトン、pending status、分類別alert、再登録可能を定義する。            |
| dark mode            | PASS     | dark背景／前景／主要色とactive・状態確認・再登録可能の状態pairを§8.4で定義する。                          |
| density              | PASS     | 初期／再登録可能だけが編集フォームを持ち、照合待ちは保持入力要約、成功は照合済み内容へ情報量を絞る。      |
| responsive           | PASS     | Desktopは2列policy、Mobileは1列、長い識別子は折り返し、Browser確認では両previewのoverflow 0件を確認した。 |
| accessibility        | PASS     | 通知担当の相互排他、status／alert、結果見出しfocus、focus維持、44px target、全文選択を定義する。          |

#### 第1段階 — 重要

- `照合結果: 登録試行と一致`と`登録状態: active`を成功ResultRegionへ置き、receipt両値、profile、configの完全一致を安全な要約で伝える。
- `reconciliation_required`と`re_registration_ready`を文言、入力状態、主要操作で分け、同じattemptの確認と新しいattemptの開始を明確にする。
- 単一通知スロットで`ResultRegion`と`ValidationSummary`を相互排他的にし、支援技術へ一つの通知を伝える。
- 状態確認完了のfocusがcorrelation ID依存で欠け得る → 完了sequenceまたは`registrationOutcome`をfocus triggerにする → 同じcorrelation IDでも結果開始位置を確実に伝える。

#### 第2段階 — 洗練

- Mineral teal基調と状態別tintをtoken化し、確認・成功・再登録可能を色と文言の両方で識別できる。
- generic font stackでは製品固有性が弱い → `IBM Plex Sans JP`と`IBM Plex Mono`へ役割を分ける → 日本語UIと識別子の可読性を同じ製品言語で揃える。
- 状態ごとにフィールド配置が変わり得る → 初期と再登録可能は同じ15フィールド順、照合待ちは同じ順の保持表示に揃える → 状態遷移後も視線位置と操作記憶を保てる。

#### 第3段階 — 仕上げ

- 状態確認ボタンがpendingでfocusを失い得る → DOMを維持して`aria-disabled`と重複実行ガードを使う → キーボード利用者の現在位置を保持する。
- 長い識別子が390px幅を圧迫する → `overflow-wrap:anywhere`と選択可能な等幅表示を使う → 問い合わせ転記とモバイル可読性を両立する。
- 状態面の変化が急に見える → 150〜200msのease-outとreduced-motion時の即時反映を使う → 操作速度を保ちながら状態変化を理解できる。

### 簡素化評価

- `ResultRegion`はServer Actionのpending／完了を伝える主要要素として必要。
- `ValidationSummary`はBrowser入力検証の修正位置を伝える要素として必要で、ResultRegionと同じ通知スロットを共有する。
- correlation IDはsafe failureの運用照合に必要。
- `照合結果`と`登録状態`はactive成功の根拠を利用者向けに要約するために必要。
- 状態確認が必要な画面の編集停止表示は同じattemptを保つために必要。再登録可能の編集フォームは新しいattemptを始めるために必要。
- 各画面の主要操作は`Agentを登録`、`登録状態を確認`、`Agentの概要を開く`、`Agentを再登録`のいずれか一つとし、視覚的な重みを状態の目的へ合わせる。

品質判定: `PASS`。実装評価では4フィールド契約、サーバー専用所有境界、単一ライブ領域の所有責務、分類対応、フォーカス配置を確認する。

## 12. 前提と確認事項

### 前提

- `safeErrorCategory`は`configuration`、`permission_denied`、`internal`、検証用`invalid_argument`を安定値として返す。
- 成功結果は`safeErrorCategory: null`を返す。
- `correlationId`はBrowser-safeな可観測性識別子である。
- 登録`displayData.registrationOutcome`は`active`、`reconciliation_required`、`re_registration_ready`の安全な表示状態を返す。
- 成功`displayData`は登録後の`agentId`／`displayName`と`registrationOutcome: 'active'`、またはポリシー概要に必要な安全化済みメタデータを含む。
- 再登録可能結果は`safeStatus: 'failed'`と`registrationOutcome: 're_registration_ready'`を組み合わせ、ResultRegionのalertと編集可能な保持入力を表示する。
- origin許可リスト詳細はサーバー専用設定が所有する。

### 確認事項

文言、配置、状態、フォーカス、ライブ領域、問い合わせ導線、所有境界は本仕様で確定済み。問い合わせURLは個別契約で定義し、本仕様は問い合わせIDと運用担当者への案内を対応導線とする。初期、状態確認が必要、状態確認中、active成功、再登録可能のUI判断は本仕様を実装へ直接写像できる粒度で定義する。

## 13. Wireframe対応表

| 成果物                                                                   | 内容                                            | 対象状態                                                 |
| ------------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------- |
| `wireframes/managed-agent-registration-desktop.wireframe.json` / `.html` | 1440pxデスクトップ登録ルートの4画面inventory    | 初期、状態確認が必要＋状態確認中、active成功、再登録可能 |
| `wireframes/managed-agent-registration-mobile.wireframe.json` / `.html`  | 390pxモバイル登録ルートの4画面inventory         | 初期、状態確認が必要＋状態確認中、active成功、再登録可能 |
| `wireframes/agent-operation-result-desktop.wireframe.json` / `.html`     | デスクトップのAgent選択済み設定内`ResultRegion` | 処理中、成功、権限、設定、internal、問い合わせ導線       |
| `wireframes/agent-operation-result-mobile.wireframe.json` / `.html`      | モバイルのAgent選択済み設定内`ResultRegion`     | 処理中、成功、権限、設定、internal、問い合わせ導線       |
