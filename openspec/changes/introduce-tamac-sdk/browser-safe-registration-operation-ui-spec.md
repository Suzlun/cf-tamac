# ブラウザー安全化 Agent登録・操作結果 UI仕様

- 変更名: `introduce-tamac-sdk`
- 設計担当: `unit/client/designer`
- 実装担当: `unit/client/engineer`
- 対象: `packages/client/**` Management Client
- 状態: OpenSpec契約を配置、文言、状態、アクセシビリティへ写像したUI設計成果物

## 1. 意図と対象利用者

### 意図

`/agents/new`の管理対象Agent登録と、Agent選択済みシェル内のAgent操作結果を、ブラウザー安全化済みの4フィールド`displayData`、`safeStatus`、`safeErrorCategory`、`correlationId`で一貫して伝える。文言、配置、フォーカス、ライブ領域、エラー分類ごとの操作可否を本仕様で確定する。

### 対象利用者

| 利用者               | このUIで行うこと                                                     | UIが提供する支援                                                 |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Agent運用者          | 許可済みAgent RPC originで管理対象Agentを登録し、Agent設定を変更する | 成功状態、安全な結果、次の操作を明確に示す                       |
| セキュリティ担当者   | originポリシーとブラウザー／サーバー境界を確認する                   | 機密情報のサーバー専用所有境界とブラウザー結果の許可リストを示す |
| サポート・運用担当者 | 安全な分類とcorrelation IDでサーバー側ログを追跡する                 | 問い合わせID全文、コピー操作、コピー完了通知を提供する           |

## 2. 設計根拠と対応する完成状態

- SDK経由のServer Actionが返すブラウザー結果は、安全化済み表示データ、安全な状態、安全なエラー分類、correlation IDで構成される: `openspec/changes/introduce-tamac-sdk/specs/tamac-sdk/spec.md:73-98`。
- 登録時とSDK通信経路の構築直前に、正規化済みHTTPS Agent RPC originをサーバー管理の許可リストで検証する: `openspec/changes/introduce-tamac-sdk/specs/tamac-sdk/spec.md:100-128`。
- `@cf-tamac/sdk`と生成済みRPC descriptorはサーバー側実行グラフが所有する: `openspec/changes/introduce-tamac-sdk/specs/workspace-governance/spec.md:13-31`。
- 登録フォームの確定階層は識別情報 → 既定モデルポリシー → credential参照 → 登録操作である: `packages/client/src/components/agent-registration-form.tsx:253-300`。
- 既定モデルポリシーの確定配置はAgent選択済み設定画面内で、概要／編集 → 汎用設定の順である: `packages/client/src/components/agent-settings-form.tsx:394-423`。
- 安全化結果の補助関数は状態、分類、correlation IDをブラウザー安全化済み結果オブジェクトへ投影し、機密エラー情報をサーバー専用の可観測性領域が所有する: `packages/client/src/server/agent-rpc/safe-results.ts:31-45`、`packages/client/src/server/agent-rpc/safe-results.ts:69-99`。

## 3. 画面・ルート・コンポーネント一覧

| 画面／領域                   | 役割                          | 確定配置                                                                                                                                                                           |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/agents/new`                | 管理対象Agent登録             | `ControlRoomFrame`、識別情報、既定モデルポリシー、credential参照、登録操作の順。状態領域は`<form>`先頭、説明文の後、最初のフィールドの前。成功時は同じルートで成功確認を表示する。 |
| `/agents/[agentId]/settings` | Agent選択済み設定             | 既定モデルポリシーを代表Agent操作とする。操作結果領域は`既定モデルポリシーを編集`の説明直後、`ModelPolicyFields`の直前。概要は編集領域より前。                                     |
| `AgentRegistrationForm`      | 登録入力と状態制御            | ブラウザー内検証、処理中状態、4フィールド結果をブラウザー表示状態として扱う。                                                                                                      |
| `ModelPolicySettingsSection` | 既定モデルポリシー操作        | 処理中状態、結果表示、安全化済み`displayData`の概要反映、操作可否を扱う。                                                                                                          |
| サーバー専用処理             | ポリシー検証、登録、Agent操作 | SDK構築、originポリシー、credential／署名、生成済みdescriptor、正規化済みエラーを所有する。                                                                                        |

Agent選択済み範囲は`/agents/[agentId]`、代表操作画面は`/agents/[agentId]/settings`とする。Management Clientのルート構成はレジストリ／詳細シェルとServer Action境界で構成する。

## 4. ブラウザー安全化結果とUI状態モデル

### 4.1 4フィールドで閉じた結果

Server Action結果の最上位キー集合は次の4フィールドで閉じる。

| フィールド          | 対応値                             | UIでの用途                                           | 所有境界                   |
| ------------------- | ---------------------------------- | ---------------------------------------------------- | -------------------------- |
| `displayData`       | ルート固有の安全化済みオブジェクト | 安全な文言、メタデータ、フィールド関連付けを表示する | ブラウザー表示モデル       |
| `safeStatus`        | `succeeded` / `failed`             | 状態外観、文言、操作可否へ写像する                   | ブラウザー表示用の結果状態 |
| `safeErrorCategory` | 成功は`null`、失敗は安定分類       | 安全な結果文言と次の操作へ写像する                   | ブラウザー分岐値           |
| `correlationId`     | 機密性を持たない完全な識別子       | サーバー側ログとの照合、問い合わせIDコピーに使う     | 可観測性の関連付け         |

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
待機
 ├─ ブラウザー内検証案内 ───────> フィールド確認 ──> 待機
 └─ 登録／保存 ────────────────> 処理中
                                      ├─ succeeded ───> 成功
                                      └─ failed ──────> 安全な結果
安全な結果
 ├─ permission_denied ─────────> 権限案内
 ├─ configuration ─────────────> 設定案内
 └─ internal ─────────────────> 入力保持と再実行
```

Agent登録済み状態、ポリシー参照、ダイジェスト、バージョン、設定バージョンはサーバー応答由来の`displayData`で確定する。成功表示と概要更新は`safeStatus="succeeded"`の受領後に行う。

## 5. 共通の操作結果領域

### 5.1 DOM位置と構造

各フォーム内に単一の`ResultRegion`領域を置く。

```text
操作説明
└─ ResultRegion
   ├─ 処理中／成功／安全な結果の見出し
   ├─ 安全な本文
   ├─ 失敗時の問い合わせ参照
   │  ├─ ラベル: 問い合わせID
   │  ├─ correlationId全文
   │  └─ ボタン: 問い合わせIDをコピー
   └─ 分類別操作
フォームフィールド
フォーム操作
```

- 待機状態では`ResultRegion`領域を高さ0で保持する。
- `correlationId`全文は等幅書体、選択可能、`overflow-wrap:anywhere`で表示する。
- 成功時は成功見出し、安全な本文、次の操作を表示する。
- 失敗時は`SupportReference`を表示する。
- コピーボタンは`type="button"`、44px以上の操作領域、アクセシブルネームを`問い合わせID {correlationId} をコピー`とする。
- コピー完了文言は`問い合わせIDをコピーしました。`。同じ`ResultRegion`内の独立した`role="status" aria-live="polite"`で一度通知する。
- Clipboard APIの利用可否に応じて、コピーボタンまたは`問い合わせIDを選択してコピーできます。`を表示する。ID本文は常に選択可能とする。

### 5.2 意味属性とライブ領域

| 状態                       | 意味属性                                                                            | フォーカス                            |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| 処理中                     | `role="status" aria-live="polite" aria-atomic="true"`。フォームに`aria-busy="true"` | 登録／保存ボタンへ維持する            |
| 成功                       | `role="status" aria-live="polite" aria-atomic="true" tabindex="-1"`                 | 完了後に結果見出しへ移す              |
| 安全な結果                 | `role="alert" aria-atomic="true" tabindex="-1"`                                     | 完了後に結果見出しへ移す              |
| ブラウザー内フィールド検証 | 概要は`role="alert"`、各フィールド案内は`aria-describedby`                          | DOM順で最初の確認対象フィールドへ移す |

ライブ通知は状態変更1回につき単一領域が担当する。`role="alert"`がassertive通知を担当し、処理中／成功／コピー完了はpolite領域が担当する。

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
         ├─ ResultRegion / ValidationSummary
         ├─ Agent ID
         ├─ Agent RPC origin
         ├─ 表示名
         ├─ 表示順（任意）
         ├─ 既定モデルポリシーfieldset
         ├─ credential参照details[open]
         └─ 操作: キャンセル / Agentを登録
```

ページ階層は状態ラベル、ページ見出し、コンテンツ見出しで構成する。既定モデルポリシーは`legend`と`作成時に有効`の状態文でセクションを示す。

### 6.2 モバイル構造

- 390px想定でShadcn `Sheet`のナビゲーション起動ボタンを最上部に置く。サイドバー内容はシェル既定順で提供する。
- メイン領域は左右16px、上下24px。すべて1列。
- フィールド順、`ValidationSummary`、`ResultRegion`の位置はデスクトップと同一。
- 既定モデルポリシーのフィールド順はポリシー参照 → プロバイダー → モデルID → 温度 → Top P → 最大出力トークン数 → ポリシー検証。
- 操作は本文末尾で`キャンセル`、主要操作`Agentを登録`の順。
- 長いorigin、モデルID、フィンガープリント、correlation IDは表示領域内で折り返す。

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

| 状態                          | 配置と動作                                       | 確定文言                                                                                                                                                                                                                         | 操作可否                                                   |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 初期                          | `ResultRegion`は高さ0。入力と補足文を表示する。  | ポリシー状態: `初期の既定ポリシーにはactive状態を使用します。`                                                                                                                                                                   | ブラウザー内検証完了後に登録可能                           |
| 処理中                        | フォーム先頭`ResultRegion`。`aria-busy=true`。   | 見出し`Agentを登録しています`、本文`登録情報を確認し、Agentを初期化しています…`、ボタン`Agentを登録しています…`                                                                                                                  | フィールドと操作は処理中の操作状態                         |
| 成功                          | フォーム領域に成功確認を表示する。               | 見出し`Agentを登録しました`、本文`「{displayName}」を管理対象に追加しました。`、主要操作`Agentの概要を開く`、副操作`Agent一覧に戻る`                                                                                             | 利用者が遷移先を選択する                                   |
| フィールド検証                | フォーム先頭の概要と各フィールド直下。           | §6.5の文言                                                                                                                                                                                                                       | フィールド確認後に登録可能                                 |
| originポリシー`configuration` | フォーム先頭の安全な結果とoriginフィールド直下。 | 見出し`Agent RPC originを確認してください`、本文`Agent RPC originを運用ポリシーで確認してください。許可済みのHTTPS originを登録すると操作を続行できます。`、フィールド案内`許可済みのHTTPS Agent RPC originを入力してください。` | origin確認、キャンセル、再登録、問い合わせIDコピー         |
| 署名前提`configuration`       | フォーム先頭の安全な結果。                       | 見出し`登録前の設定を確認してください`、本文`グローバル設定で既定のClient Service signing keyを生成して選択すると、Agent登録を続行できます。`、リンク`グローバル設定を開く`                                                      | フォーム値を保持。設定確認へ移動可能                       |
| 権限案内                      | フォーム先頭の安全な結果。                       | 見出し`Agent登録の権限を確認してください`、本文`Agent登録には管理権限を使用します。運用管理者が権限を確認できます。`                                                                                                             | フォーム値を保持。キャンセルと問い合わせIDコピーが利用可能 |
| internal安全結果              | フォーム先頭の安全な結果。                       | 見出し`登録情報を保持しました`、本文`入力内容はこの画面に保持されています。時間をおいて「もう一度登録」を実行してください。運用調査には問い合わせIDを利用できます。`、操作`もう一度登録`                                         | 入力値を保持。再実行可能                                   |

ルート読み込み中はページシェルとフィールドラベル位置を保つスケルトンを使う。スケルトンはラベルと形状で構成する。登録成功はサーバー応答由来の`displayData`で表示する。

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

| 状態             | `safeStatus` / 分類              | 確定文言と配置                                                                                                                                                                            | 操作可否                                                                                 |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 読み込み中       | UI内部状態                       | ポリシー概要はラベルスケルトン。`ResultRegion`は高さ0。                                                                                                                                   | 編集領域は読み込み中の操作状態                                                           |
| 設定案内         | UI内部状態                       | 概要`既定モデルポリシーを設定すると、EventsからのRunsでactiveなWorkers AI policyを利用できます。`                                                                                         | 編集領域の初期値から操作可能                                                             |
| 入力検証         | 内部状態または`invalid_argument` | 見出し`ポリシーの入力内容を確認してください`、本文`強調表示されたフィールドを確認するとポリシー検証を続行できます。`                                                                      | 最初の確認対象フィールドへフォーカス                                                     |
| 処理中           | 結果待機中                       | 見出し`既定モデルポリシーを保存しています`、本文`ポリシーを保存し、Agent設定へ適用しています…`、保存ボタン`保存しています…`                                                               | ポリシーフィールドと設定変更操作は処理中の操作状態                                       |
| 成功             | `succeeded` / `null`             | 見出し`既定モデルポリシーを保存しました`、本文`「{policyRef}」を保存し、設定バージョン v{configVersion} を適用しました。`                                                                 | 安全化済み`displayData`で概要を更新。成功メッセージを表示                                |
| 権限案内         | `failed` / `permission_denied`   | 見出し`更新権限を確認してください`、本文`既定モデルポリシーの更新には管理権限を使用します。安全なメタデータを確認できます。`                                                              | 概要を表示。編集領域は権限確認状態。問い合わせIDを表示                                   |
| 設定案内         | `failed` / `configuration`       | 見出し`Agentの接続設定を確認してください`、本文`Agent RPC originを運用ポリシーで確認してください。許可済みのHTTPS originを登録すると操作を続行できます。`、リンク`登録情報を編集`         | ポリシーフィールドは参照表示。`/agents/new?edit={agentId}`へ移動可能。問い合わせIDを表示 |
| internal安全結果 | `failed` / `internal`            | 見出し`操作を再実行できます`、本文`Agent設定は直前の確定値を保持しています。時間をおいて「もう一度保存」を実行してください。運用調査には問い合わせIDを利用できます。`、操作`もう一度保存` | 入力値と概要を保持。再実行可能。問い合わせIDを表示                                       |
| 同時操作         | UI内部状態                       | 補足文`進行中の操作が完了すると既定モデルポリシーを変更できます。`                                                                                                                        | ポリシー変更操作は処理中の操作状態                                                       |

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
- 検証案内後は概要を読み上げ、DOM順で最初の確認対象フィールドへフォーカスする。
- 成功後は`Agentを登録しました`の見出しへフォーカスし、その後`Agentの概要を開く`、`Agent一覧に戻る`の順にTab移動する。

### 8.3 ポリシー編集のフォーカス順

1. ポリシー参照
2. プロバイダー
3. モデルID
4. 温度
5. Top P
6. 最大出力トークン数
7. ポリシーを検証
8. 既定ポリシーを保存

安全な結果の完了時は`ResultRegion`へフォーカスし、次のTabで問い合わせIDコピー、分類別操作、元のフィールドへ進める。処理中はフォーカスを登録／保存ボタンに維持する。

### 8.4 視覚アクセシビリティ

- Shadcn既定tokenを使う: `packages/client/app/globals.css:13-85`。
- 成功／安全な結果／処理中は見出しと本文を必ず表示し、状態色とテキストを組み合わせる。
- テキストのコントラストは通常テキスト4.5:1以上、大きいテキスト3:1以上。色付き背景上のテキストは背景色と同系統の高コントラスト前景色を使う。
- 入力欄／ボタンの操作領域は44px以上。視認可能なフォーカスリングを提供する。
- 長いIDは折り返し、全文を本文へ表示する。
- ライト／ダークの双方で意味トークンを使用する。
- 状態遷移は150〜200ms以内のease-outを使用し、`prefers-reduced-motion`では即時反映する。

## 9. 所有境界と閉じた通信境界

### ブラウザー表示領域の所有境界

- フォーム入力
- 安全化済み`displayData`
- `safeStatus`
- `safeErrorCategory`
- 機密性を持たない`correlationId`
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

- `packages/client/app/agents/new/page.tsx`: 4フィールドで閉じた結果を返すServer Actionラッパーを`AgentRegistrationForm`へ渡す。
- `packages/client/src/components/agent-registration-form.tsx`: 説明文後・最初のフィールド前に常設`ResultRegion`領域を置く。成功時は§6.6の成功確認を表示する。
- `packages/client/src/components/agent-registration-actions.tsx`: 処理中文言と処理中の操作状態を§6.6へ合わせる。
- `packages/client/src/components/schemas/agent-registration.ts`: ブラウザー内検証文言、フィールド順、4フィールド結果型を定義する。
- `packages/client/src/server/actions/managed-agents.ts`: 登録と初期化をサーバー側に集約し、結果を4フィールド結果へ投影する。
- `packages/client/src/server/actions/managed-agent-registration.ts`: 正規HTTPS originとサーバー管理の許可リストをClient D1書き込み前に検証する。SDK通信経路の構築時にも同じポリシーを適用する。
- `packages/client/src/server/agent-rpc/safe-results.ts`: 登録とAgent操作へ共通の4フィールド結果契約を提供する。

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
- モバイルで表示領域内の折り返し、44px操作領域、DOM順が保たれること。
- ブラウザーバンドル分類がブラウザー表示許可リストとサーバー専用所有境界に一致すること。
- ルートマニフェストがレジストリ／詳細シェルで構成されること。

## 11. UI品質判定

### Impeccable

- 検出器の実行結果: `[]`。対象は`agent-registration-form.tsx`、`model-policy-settings-section.tsx`、`model-policy-fields.tsx`。
- 結果表示はフォーム内の単一インライン領域とする。
- アラートは全周枠線、意味のある背景色、意味のある前景色を使う。
- ページ状態ラベルとセクション見出しを1つずつ使い、明瞭な階層を作る。
- 動きは状態通知に対応するease-out遷移を使う。

### design-auditの段階別評価

#### 第1段階 — 重要

- 4フィールド契約 → ブラウザーの機密性と分類対応をUI全体で一貫させる。
- 許可リスト由来の`configuration` → フィールド／フォーム／問い合わせ導線へ安全な結果を表示し、入力確認と運用問い合わせを支援する。
- 完了時フォーカス → `ResultRegion`へフォーカスし、キーボード／スクリーンリーダー利用者へ非同期完了を伝える。

#### 第2段階 — 洗練

- ページ状態ラベルとセクション見出し → 視覚的な重みを機能的重要度へ合わせる。
- 分類別固定文言 → 同じ原因を同じ言葉で扱う。
- correlation IDのラベル、全文、コピー完了通知 → 問い合わせ操作を直感的に理解できる。

#### 第3段階 — 仕上げ

- コピー完了のpoliteライブ領域 → キーボード／スクリーンリーダーでも完了を確認できる。
- 長い識別子の折り返しと選択 → モバイル表示と問い合わせ転記を両立する。
- 状態遷移 → 製品UIの操作速度と`prefers-reduced-motion`を両立する。

### 簡素化評価

- `ResultRegion`は非同期結果を伝える主要要素。
- correlation IDは失敗時の運用照合要素。
- ブラウザー表示内容は安全な見出し、本文、問い合わせ参照、安全な操作で構成する。
- 画面構成は単一インライン領域と主要操作1つを中心にする。

品質判定: `PASS`。実装評価では4フィールド契約、サーバー専用所有境界、単一ライブ領域の所有責務、分類対応、フォーカス配置を確認する。

## 12. 前提と確認事項

### 前提

- `safeErrorCategory`は`configuration`、`permission_denied`、`internal`、検証用`invalid_argument`を安定値として返す。
- 成功結果は`safeErrorCategory: null`を返す。
- `correlationId`は機密性を持たない可観測性識別子である。
- 成功`displayData`は登録後の`agentId`／`displayName`、またはポリシー概要に必要な安全化済みメタデータを含む。
- origin許可リスト詳細はサーバー専用設定が所有する。

### 確認事項

文言、配置、状態、フォーカス、ライブ領域、問い合わせ導線、所有境界は本仕様で確定済み。問い合わせURLは個別契約で定義し、本仕様は問い合わせIDと運用担当者への案内を対応導線とする。

## 13. Wireframe対応表

| 成果物                                                                   | 内容                                            | 対象状態                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------- |
| `wireframes/managed-agent-registration-desktop.wireframe.json` / `.html` | デスクトップ登録ルートと状態一覧                | 初期、処理中、成功、フィールド検証、origin設定案内 |
| `wireframes/managed-agent-registration-mobile.wireframe.json` / `.html`  | モバイル登録ルートと状態一覧                    | 初期、処理中、成功、フィールド検証、origin設定案内 |
| `wireframes/agent-operation-result-desktop.wireframe.json` / `.html`     | デスクトップのAgent選択済み設定内`ResultRegion` | 処理中、成功、権限、設定、internal、問い合わせ導線 |
| `wireframes/agent-operation-result-mobile.wireframe.json` / `.html`      | モバイルのAgent選択済み設定内`ResultRegion`     | 処理中、成功、権限、設定、internal、問い合わせ導線 |
