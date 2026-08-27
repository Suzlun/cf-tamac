# Contributing

プロジェクトへの貢献に感謝します。レビューと保守をしやすくするため、以下のガイドラインに従ってください。

## ドキュメント

- コーディング規則（一次資料）: `CODING_STANDARDS.md`
  - `eslint.config.js` は規約の自動検査（実装）として追従させます
- 変更運用（一次資料）: `docs/change-operation.md`
- 永続的な振る舞い契約: `openspec/specs/**/spec.md`
  - `pnpm lint` で変更スキーマ、提案、厳格な成果物形式、Playwright E2E試験からScenarioへの一方向参照、作業パッケージと設計の対象範囲を検査します
  - 活動中差分は同期前から構造、識別子、競合を検査し、Scenarioから自動試験への参照は要求しません
- SDK: `packages/sdk/**` の `tamac-sdk` は server-side Agent RPC SDK です。Browser-visible module から SDK、Connect runtime、generated RPC descriptor、credential、JWT signing を import しません。
- SDK surface: `TamacAgentClient` は Client Service Ed25519 JWT operations、`TamacProviderIngressClient` は Provider Ed25519 detached-signature `PublishEvent` / `PublishToolResult` / `PublishDeliveryResult` です。Client D1、acting user、JWT context を Provider surface に渡しません。

## コメントと TSDoc

- `packages/**/src/**/*.{ts,tsx}` の generated output と test 以外の exported declaration には TSDoc を置きます。ESLint は TSDoc の存在を検査しますが、リポジトリの著者規約として public API（function、method、type、interface、struct）は日本語の複数行 TSDoc で役割、引数、戻り値、エラー、使用例を説明します。
- 実装の各処理には日本語コメントを残し、意図、入力/出力、side effect を読者が追えるようにします。コメントは実装の代替ではなく、security boundary、validation、永続化、external call など判断理由が必要な処理を明確にします。

## 前提環境

- Node.js 24.12+ / pnpm 11.16.0+（`corepack enable` 推奨）
- Wrangler 4.57.0+
- （任意）Dev Container + Docker（推奨）

## セットアップ

1. リポジトリをクローンし、依存をインストール
   ```bash
   corepack enable
   pnpm install
   ```
2. 開発サーバー
   ```bash
   pnpm dev:agent              # @cf-tamac/agent
   pnpm dev:client  # @cf-tamac/client
   ```

## 依存関係とサプライチェーン対策

- `pnpm-workspace.yaml` の `minimumReleaseAge: 4320` により、npm に公開されてから72時間未満の依存パッケージは解決対象から外します。
- リリースに含める依存追加・更新は、リリース予定日の72時間以上前に完了してください。
- `minimumReleaseAge` の引き下げ、`minimumReleaseAgeExclude` の追加、`--config.minimumReleaseAge=0` のような迂回は行わないでください。
- `allowBuilds` はインストール時スクリプトを許可する明示リストです。新しいパッケージを追加する前に、必要性と公開元を確認してください。
- `dangerouslyAllowAllBuilds` は有効化しないでください。

## ブランチ運用

- 基本: `develop` から作業ブランチを切る
- 命名例: `feat/<topic>` / `fix/<topic>` / `docs/<topic>` / `refactor/<topic>`
- 1PR = 1意図（混ぜすぎない）

## コミット

Husky によりコミット時に検証されます。

- `commit-msg`: `pnpm commitlint --edit $1`
- `pre-commit`: `pnpm lint-staged` then `pnpm check:codegen`

コミットメッセージは Conventional Commits に従ってください（`commitlint.config.js`）。

例:

- `feat(client): add agent registry page`
- `fix(agent): prevent invalid env injection`
- `docs: update coding standards`

## 変更を入れるときの原則

- まず `CODING_STANDARDS.md` の意図（層の責務・依存方向）に沿って配置する
- “例外” は最小にする（ESLint disable は説明必須。理由が妥当かレビュー対象）
- 自動生成ファイルは手で直さない
  - 例: `packages/agent/proto/**`、`packages/agent/src/generated/rpc/**`、`packages/client/src/generated/agent-rpc/**`、`packages/sdk/src/generated/agent-rpc/**`
- `packages/sdk/src/generated/agent-rpc/**` を含む4つの generated roots は mandatory policy target です。contract は TypeSpec -> proto -> descriptors の順で更新し、互換コピーを追加しません。
- 仕様が変わる変更は spec と必要な試験を一緒に更新する
  - Playwright E2E試験だけが題名から既存Scenarioを`[...-S001]`の形式で参照する
  - Scenarioごとの自動試験は要求せず、純粋な単体試験はScenario識別子を参照しない
  - 試験分類はPlaywright E2E試験と純粋な単体試験だけとし、試験専用の製品側API、公開要素、生成処理、分岐、Binding、設定を作らない
- `BEHAVIOR`と`ARCHITECTURE`では、利用者が選択した`openspec/proposer`がRequest候補を提示し、所有者の明示確認後だけChangeと`request.md`を作成する
  - 解決手段より先に、利用者、現状、変更動機、期待価値、望む成果を確認する
  - 変更動機には困りごとだけでなく、期待、機会、好奇心、可能性も含める
  - ProposerがRequestと全計画成果物を所有し、自明でない内容を逐次確認する
  - `proposal.md`、Specsは確認済みRequestから直接導ける肯定的成果だけを記録し、非目標、対象外、却下案、旧実装の不在、追加しない技術または機能を契約化しない
  - 不要なRequirementは`REMOVED Requirements`で除去し、反対向きのRequirementへ置き換えない

計画には`openspec/proposer`、実装には`openspec/applier`を利用者が選択します。Proposerは全計画成果物、Applierは実装統括と`tasks.md`進捗だけを所有します。

## 変更運用

変更を始める前に、`docs/change-operation.md` に従って三軸を独立に決めます。

| 軸               | 値                                     | 判断内容                           |
| ---------------- | -------------------------------------- | ---------------------------------- |
| `Operation Lane` | `DIRECT` / `BEHAVIOR` / `ARCHITECTURE` | 振る舞い・構造をどの運用で扱うか   |
| `UX Mode`        | `NONE` / `CONTINUITY` / `SHAPE`        | 利用者に見える体験をどう扱うか     |
| `Review Depth`   | `STANDARD` / `DEEP`                    | 独立レビューをどの深さで実施するか |

- `DIRECT`: 観測可能な振る舞いも物質的な内部構造も変えない。OpenSpec Change は不要です。
- `BEHAVIOR`: 観測可能な振る舞いを変更する。`behavior-change` の OpenSpec Change が必要です。
- `ARCHITECTURE`: 物質的な内部構造を変更する。`architecture-change` の OpenSpec Change が必要です。
- `architecture-change`が観測可能な振る舞いを変更しない場合は`.openspec.yaml`に`skip_specs: true`を設定し、差分仕様、Requirement、Scenarioを作成しません。
- `SHAPE` は UX の方向付けが必要な場合だけ使用します。運用区分から UX モードを推測しません。
- 実際の UI 変更にはプロダクトデザイナーの関与と、デスクトップ・モバイル双方の実ブラウザ確認が必要です。
- 画像生成による UI モックアップは任意の非契約証跡であり、仕様や実ブラウザ確認を置き換えません。
- `STANDARD` を既定とし、重要なセキュリティ、データ、外部契約、移行、領域横断の構造、活動中 Change との相互作用に危険がある場合は `DEEP` を選びます。

OpenSpec Changeは、`BEHAVIOR`なら`pnpm exec openspec new change <change-id> --schema behavior-change`、`ARCHITECTURE`なら`pnpm exec openspec new change <change-id> --schema architecture-change`で作成し、`openspec/changes/**`を手作業で作りません。OpenSpec `1.8.0`の`new change`は`openspec/config.yaml#schema`をChange作成時の既定値として参照しないため、`--schema`を省略しません。OpenCodeの公式コアコマンドとスキルは`pnpm gen:openspec`でOpenSpec `1.8.0`から同時に再生成し、`.opencode/commands/opsx-*.md`と`.opencode/skills/openspec-*/SKILL.md`を手編集しません。

OpenSpec の `tasks.md` は粗い作業パッケージ台帳です。ファイル、補助処理、試験階層の詳細は、現在の作業パッケージと検証結果に基づき実装時に段階的に決めます。

`architecture-change`の`design.md`は、存在する全delta Spec Unitをパッケージで代替可能な汎用能力へ分解し、`Reuse Assessment`へ再利用元分類、採用判断、対象と版、対象能力を調査範囲に含む調査報告を記載します。`skip_specs: true`の場合はSpec Unitや調査行を捏造しません。Requirement対応表は外部候補調査の証拠にならず、推移依存は対象packageの直接依存として宣言するまで採用済みと扱いません。`pnpm lint:openspec`は存在するSpec Unitの欠落、分類値、調査報告の実在を検査します。

一つの Change に対する Scenario と試験の追跡は次で確認し、完了前には引数なしの全体検査も実行します。

```bash
node scripts/openspec/verify-scenario-coverage.mjs --change <change-id>
node scripts/openspec/verify-scenario-coverage.mjs
```

## 自動生成

### Agent API

Agent API 契約 (TypeSpec) を変更したら、proto と Agent/Client/SDK RPC descriptors を再生成してください。生成物は手編集しません。

```bash
pnpm gen:agent:proto
pnpm gen:agent:rpc
```

CI-style の drift check は次を使います。

```bash
pnpm check:codegen
```

Agent public API は Connect unary binary Protobuf だけを公開します。REST/OpenAPI/Orval、ad-hoc JSON DTO、Browser direct Agent RPC、Client Agent API proxy route は追加しないでください。Agent 本番 Client Service 認証は Ed25519 JWT と `AGENT_CONTROL_PLANE_TRUST` に閉じ、HS256、`AGENT_CREDENTIAL_*`、bootstrap RPC、AgentTrustRegistry、REST/JSON auth route を本番 trust source にしません。

### Server-side SDK と Client adapter

`tamac-sdk` は Agent RPC の server-side typed consumer です。SDK runtime は SDK 自身の command-owned generated descriptor と Connect unary binary Protobuf transport を使い、Agent または Client runtime source を import しません。SDK generated descriptor は `packages/sdk/src/generated/agent-rpc/**` に `pnpm gen:agent:rpc` が出力するため、手編集しません。

Management Client は `packages/client/src/server/agent-rpc/**` の server-only adapter から SDK を使います。Client D1、encrypted Client Service signing key store、acting user policy、managed Agent resolution、Next.js `server-only` boundary は Client が所有し、解決済みの server-side context だけを SDK に渡します。browser-visible module は SDK、Connect runtime、generated descriptor、credential、JWT signing を import しません。

`AGENT_RPC_ALLOWED_ORIGINS` は unique canonical HTTPS origins の non-empty JSON array です。configuration literal は `URL.origin` と完全一致させます。Browser registration input は canonicalize 後に exact match で承認し、Client D1 の stored origin も signing key、acting user、SDK transport の解決前に再検証します。Client Service JWT を allowlist 外の origin へ送信してはいけません。

SDK-backed Server Action は成功・失敗とも Browser-safe result の `displayData`、`safeStatus`、`safeErrorCategory`、secret-free `correlationId` だけを返します。raw Connect/SDK diagnostic、origin policy detail、credential、JWT、signing material、D1 record を Browser payload に含めません。

Integration Provider は `TamacProviderIngressClient` の three-method surface だけを使い、unsigned Protobuf body digest と canonical text を Ed25519 で detached-sign します。Agent は Provider 自己申告の skew を信頼せず、Agent-owned fixed `300_000` ms window、active Installation/trust key、digest、signature、identity を検証してから `INTEGRATION_INSTALLATION` principal を作り、nonce/idempotency と Agent-local final authorization を行います。

### DB

Agent Service は D1 を持ちません。Agent-owned state は Drizzle ORM（`drizzle-orm/durable-sqlite` または現行の Durable Object SQLite adapter）経由の `AIAgent` Durable Object SQLite と Agent-owned blob storage に置きます。Prisma は使用しません。

Client D1 schema を変更する場合は、Drizzle ORM（`drizzle-orm/d1`）を Client D1 repository layer として使い、`packages/client/src/server/db/schema.ts` と `packages/client/src/server/db/migrations/**` を同時に更新してください。Client D1 は managed Agent records、外部 credential references、`CLIENT_CREDENTIAL_ENCRYPTION_KEY` で保護する encrypted Client Service signing key store だけを保持します。Agent domain snapshots、plaintext secrets、private JWK plaintext、raw JWT は保存しません。

Client Service signing key を扱う変更では、Management Client の server-only module だけが encrypted private JWK を復号し、Browser payload、HTML、bundle、storage、public Client route、log に private JWK、encrypted private JWK、生 JWT、signing material を出さないことを確認してください。運用手順は `docs/operations/agent-control-plane-auth.md` を更新し、signing key generation、public-only trust config export、Agent Worker secret setup、rotation、emergency revoke、break-glass recovery、health verification を同期してください。

適用は `wrangler d1 execute ... --config packages/client/wrangler.toml --file <migration.sql>` を使います。

## 実装時のチェック

PR 前にローカルで以下を通してください。

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm --filter tamac-sdk check
pnpm check:codegen
pnpm lint:governance
pnpm test:governance
pnpm check:production-contracts && pnpm check:production-environment
```

必要に応じて関連テストも実行してください。

```bash
pnpm test          # すべて（vitest workspace）
pnpm test:agent    # @cf-tamac/agent
pnpm test:client # @cf-tamac/client
pnpm test:governance # governance scripts
pnpm test:e2e      # Playwright（変更が e2e に影響する場合）
pnpm --filter tamac-sdk test # tamac-sdk
```

Agent/SDK/Client package を触った場合は、必要に応じて次も確認してください。

```bash
pnpm check:agent
pnpm --filter tamac-sdk check
pnpm check:client
pnpm build # Agent、SDK、Management Client
```

## プルリクエストの流れ

1. `develop` を最新化し、作業ブランチを作成
2. 変更・テスト・ドキュメントを追加/更新（必要な範囲で）
3. `pnpm lint` と `pnpm check`、関連テストを通す
4. `develop` 向けプルリクエストに以下を記載
   - 変更の目的/背景
   - 変更点の要約
   - `Operation Lane`、`UX Mode`、`Review Depth`
   - `OpenSpec Change`は`BEHAVIOR`と`ARCHITECTURE`で必須。`Scenario IDs`は`BEHAVIOR`と差分仕様を持つ`ARCHITECTURE`で必須。`DIRECT`と`skip_specs: true`の`ARCHITECTURE`では理由付きの`なし`を使用可能
   - 動作確認内容（コマンド、確認手順）
   - 破壊的変更がある場合は影響範囲と移行方法
   - 実際の UI / UX 変更がある場合は `Desktop Before`、`Desktop After`、`Mobile Before`、`Mobile After` の画像

不明点があれば Issue/PR で相談してください。
