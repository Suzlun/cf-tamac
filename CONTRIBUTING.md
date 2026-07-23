# Contributing

プロジェクトへの貢献に感謝します。レビューと保守をしやすくするため、以下のガイドラインに従ってください。

## ドキュメント

- コーディング規則（一次資料）: `CODING_STANDARDS.md`
  - `eslint.config.js` は規約の自動検査（実装）として追従させます
- 仕様（契約）: OpenSpec の `spec.md`
  - `pnpm lint` で `pnpm exec openspec validate --all --strict`、Change Intent確認ゲート、Scenario IDカバレッジ検査が走ります
- SDK: `packages/sdk/**` の `@cf-tamac/sdk` は server-side Agent RPC SDK です。Browser-visible module から SDK、Connect runtime、generated RPC descriptor、credential、JWT signing を import しません。
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
- 仕様が変わる変更は spec とテストをセットで更新する
  - `#### Scenario: ... (..-S001)` に対して、テストタイトルに `[...-S001]` を含める
  - 自動化できない Scenario は `Tags: manual` を明示する
- OpenSpec Change は、依頼の意味をrepositoryの事実と照合して所有者が確認した`intent.md`から開始する
  - `Intent-Status: CONFIRMED`と`Owner-Confirmation: CONFIRMED`になる前にproposal以降を作成しない

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

`@cf-tamac/sdk` は Agent RPC の server-side typed consumer です。SDK runtime は SDK 自身の command-owned generated descriptor と Connect unary binary Protobuf transport を使い、Agent または Client runtime source を import しません。SDK generated descriptor は `packages/sdk/src/generated/agent-rpc/**` に `pnpm gen:agent:rpc` が出力するため、手編集しません。

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
pnpm --filter @cf-tamac/sdk check
pnpm check:codegen
pnpm lint:governance
pnpm test:governance
pnpm gen:deploy-artifacts && pnpm check:deploy-artifacts
```

必要に応じて関連テストも実行してください。

```bash
pnpm test          # すべて（vitest workspace）
pnpm test:agent    # @cf-tamac/agent
pnpm test:client # @cf-tamac/client
pnpm test:governance # governance scripts
pnpm test:e2e      # Playwright（変更が e2e に影響する場合）
pnpm --filter @cf-tamac/sdk test # @cf-tamac/sdk
```

Agent/SDK/Client package を触った場合は、必要に応じて次も確認してください。

```bash
pnpm check:agent
pnpm --filter @cf-tamac/sdk check
pnpm check:client
pnpm build # Agent、SDK、Management Client
```

## プルリクエストの流れ

1. `main` を最新化し、作業ブランチを作成
2. 変更・テスト・ドキュメントを追加/更新（必要な範囲で）
3. `pnpm lint` と `pnpm check`、関連テストを通す
4. PR に以下を記載
   - 変更の目的/背景
   - 変更点の要約
   - 動作確認内容（コマンド、確認手順）
   - 破壊的変更がある場合は影響範囲と移行方法

不明点があれば Issue/PR で相談してください。
