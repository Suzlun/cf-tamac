# 調査報告: 能力単位の再利用判断契約の移植

## 基本情報

- 調査日時: 2026-08-25 05:30:40 +0000
- 調査者: `researcher`
- 依頼概要: `cfreact-template`のコミット`1feb0e2`が導入した能力単位の再利用判断契約を`cf-tamac`へ適合できるか調査する。
- 調査範囲: 移植元コミット`1feb0e276ca868f3e0d5529629b7379ed7ce2d34`、`cf-tamac`のOpenSpecスキーマ、OpenCode定義、検査処理、文書、実行スクリプト、Agent Service、Management Client、SDK、Protobuf RPC、Scenario/Test追跡、Agent権限。
- 調査時点のリポジトリ: `chore/scoped-reuse-decisions`、基点`6e38fbbe6301718e2f8698dc6cc9172a4ac18492`、移植コミットの競合解消および検証中。

## 結論

移植元の契約は、`cf-tamac`の製品コードやProtobuf RPC契約を変更せず、OpenSpecとOpenCodeの統制面へ適合できる。移植元の15ファイルに対する変更を基礎とし、対象側のAgent Service、Management Client、SDK、Scenario/Test追跡、既存統制スクリプトを保持する必要がある。対象側には活動中の`architecture-change`設計が一件あり、新検査を導入する際に既存の物質的判断を能力単位の`Reuse Assessment`表へ移行する必要がある。

確認済みの事実として、新しい検査処理は対象側の既存インポート別名`#openspec/change-artifacts`と`collectActiveChangeDirectories`をそのまま利用できる。判断として、移植元のフロントエンド・バックエンド向け委任先は採用せず、対象側の`unit/agent/engineer`、`unit/client/engineer`、`unit/build/builder`を維持する。

## 既存調査の確認

| 既存報告                                                                         | 関連性 | 鮮度・変化頻度 | 現在の情報との整合性 | 再検証結果                                               | 採否 |
| -------------------------------------------------------------------------------- | ------ | -------------- | -------------------- | -------------------------------------------------------- | ---- |
| なし（理由: `docs/report/research/**`には`README.md`以外の報告が存在しなかった） | なし   | なし           | なし                 | 現在のリポジトリと移植元コミットを一次資料として確認した | なし |

## 調査方法

`cf-tamac`の`AGENTS.md`を最初に読み、主作業チェックアウトと全作業ツリーの状態を確認した。最新`origin/develop`から専用作業ツリーを作成し、移植元の完全SHAを取得して`cherry-pick`した。移植元のコミット差分、競合した4ファイル、対象側のOpenSpec補助処理、スキーマ、Agent権限、文書、実行スクリプトを比較した。

既存調査報告を検索した後、リポジトリ内の一次資料だけを使用した。ウェブ調査は行っていない。公式生成コマンド、OpenSpec検査、整形、型検査、統制検査、供給網検査、Agent/Skill定義検査、および一時fixtureによる新検査の受理・拒否経路を確認した。

## 確認済みの事実

| 事実                                                                                                                         | 根拠                                                                                                       | 確認日時   | 情報の消費期限・変化要因                               |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| 移植元コミットは、スキーマ、設計ひな形、提案・レビュー・適用手順、文書、検査入口、新しい再利用判断検査を変更する             | `/home/suzlun/repos/cfreact-template`のコミット`1feb0e276ca868f3e0d5529629b7379ed7ce2d34`                  | 2026-08-25 | 移植元の後続コミットまたはOpenSpec方針変更で変化する   |
| `cf-tamac`の公開APIはTypeSpecから生成するProtobuf RPCであり、OpenAPI/Orvalを使用しない                                       | `AGENTS.md:68-76`、`AGENTS.md:107-119`（基点`6e38fbbe`）                                                   | 2026-08-25 | API契約または製品境界の変更で変化する                  |
| 対象側は`#openspec/change-artifacts`を既存の補助処理へ割り当てている                                                         | `package.json:7-10`（作業ブランチ）                                                                        | 2026-08-25 | ルートのインポート別名変更で変化する                   |
| 対象側の補助処理は活動中Changeを列挙し、`archive`を除外する                                                                  | `scripts/openspec/change-artifacts.mjs:18-36`（基点`6e38fbbe`）                                            | 2026-08-25 | OpenSpecディレクトリ構造または補助処理の変更で変化する |
| 活動中Changeは`architecture-change`の`adopt-behavior-contract-workflow`だけで、旧形式の`design.md`を持つ                     | `openspec/changes/adopt-behavior-contract-workflow/.openspec.yaml:1-2`と`design.md:1-73`（基点`6e38fbbe`） | 2026-08-25 | 活動中Changeの追加・更新・アーカイブで直ちに変化する   |
| 新検査は有効な能力単位表を受理し、delta Spec Unitの判断欠落を拒否する                                                        | `/tmp`を利用する`runGuardInFixture`による`verify-change-reuse-decisions.mjs`の隔離実行                     | 2026-08-25 | 検査処理または表契約の変更で変化する                   |
| `pnpm gen:openspec`は成功し、生成済みOpenSpec中核定義に差分を生じさせなかった                                                | 作業ブランチでの`pnpm gen:openspec`実行結果と`git status`                                                  | 2026-08-25 | OpenSpec版または生成設定の変更で変化する               |
| `pnpm lint:openspec`はスキーマ、厳格検査、規則試験に成功した後、新検査へ到達する前に既存の活動中提案の見出し不整合で失敗する | `openspec/changes/adopt-behavior-contract-workflow/proposal.md:1-83`と`pnpm lint:openspec`実行結果         | 2026-08-25 | 当該Changeの提案更新または検査規則変更で変化する       |
| `pnpm lint:eslint`は今回未変更のOpenCodeプラグインにある15件の既存型安全性違反で失敗する                                     | `.opencode/plugins/applier-compaction.ts:27-50`と`pnpm lint:eslint`実行結果                                | 2026-08-25 | 当該プラグインまたはESLint設定の変更で変化する         |
| `pnpm test:governance`は今回未変更のデプロイ成果物試験1件で失敗する                                                          | `scripts/deploy/generate-deploy-artifacts.test.mjs:93-95`と`pnpm test:governance`実行結果                  | 2026-08-25 | READMEまたはデプロイ成果物生成契約の変更で変化する     |

## 推論と判断

| 推論・判断                                                   | 根拠となる事実                                                                      | 前提                                   | 確信度 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| 新しい再利用判断検査は対象側の補助処理を複製せずに導入できる | 既存インポート別名と活動中Change列挙処理が検査処理の要求と一致する                  | OpenSpecディレクトリ構造を維持する     | 高     |
| 移植元の委任先をそのまま採用すると対象側の責務境界を壊す     | 対象側はAgent Service、Management Client、SDK用の委任先を定義している               | 現行Agent権限を維持する                | 高     |
| 現在の活動中Changeに対する再利用判断表の移行が必要である     | 活動中の`architecture-change`設計が新しい必須見出しを持たず、新検査が欠落を拒否した | 既存の物質的判断と製品要件を変更しない | 高     |
| 既存の検証失敗は今回の再利用判断契約とは因果関係がない       | 失敗箇所は`origin/develop`と同一であり、今回の変更対象外である                      | 基点の状態を比較対象とする             | 高     |

## 矛盾・不確実性

指定された短縮SHA`1feb0e2`はローカルパスからの`git fetch`で参照名として解決されなかったが、移植元リポジトリには同じコミットが存在し、完全SHAによる取得は成功した。これは内容の矛盾ではなく、Gitが短縮SHAをリモート参照として扱えなかったことによる取得方法の差である。

新検査は調査報告ファイルの実在を機械的に確認するが、報告の`調査範囲`が能力を意味的に含むかどうかは提案者、レビュー担当、分析担当の契約で確認する。自然言語の意味判定を検査処理へ独自実装していないため、この点は人とAgentによる意味確認に依存する。

## 推奨事項

移植元コミットを基礎にしつつ、競合箇所では対象側のProtobuf RPC、Scenario/Test追跡、実行スクリプト、Agent Service、Management Client、SDKの委任先と権限を維持する。新検査を`pnpm lint:openspec`へ追加し、提案者、レビュー担当、分析担当、適用担当、スキーマ、ひな形、設定、統治文書を同じ分類値と判断値へ統一する。活動中の`architecture-change`設計には、既存判断を変えずに能力単位の再利用表を追加する。

既存の活動中Change、OpenCodeプラグイン、デプロイ成果物試験の不整合は、所有者確認済みRequestと別の作業範囲を持つため、この移植作業へ混在させない。

## 出典

### ウェブ

- なし（理由: リポジトリ内の一次資料だけで依頼範囲を確認できた）

### リポジトリ

- `/home/suzlun/repos/cfreact-template@1feb0e276ca868f3e0d5529629b7379ed7ce2d34`（コミット）: 移植元の能力単位再利用判断契約。
- `AGENTS.md:68-76`（`cf-tamac`、基点`6e38fbbe`）: TypeSpec、Protobuf、RPC生成契約。
- `package.json:7-10`（作業ブランチ）: OpenSpec補助処理のインポート別名。
- `scripts/openspec/change-artifacts.mjs:18-36`（`cf-tamac`、基点`6e38fbbe`）: 活動中Changeの列挙処理。
- `scripts/openspec/verify-change-reuse-decisions.mjs:1-309`（作業ブランチ）: 能力単位の再利用判断検査。
- `openspec/schemas/architecture-change/schema.yaml:54-69`（作業ブランチ）: `Reuse Assessment`の成果物契約。
- `openspec/schemas/behavior-change/schema.yaml:20-38`（作業ブランチ）: 物質的な依存判断を`ARCHITECTURE`へ戻す契約。

## 調査ログ

1. `cf-tamac/AGENTS.md`を読み、クレド、製品境界、OpenSpec、試験、供給網の規則を確認した。
2. 主作業チェックアウトが大量の未コミット変更を持つことを確認し、編集せずに`git fetch origin`だけを実行した。
3. 最新`origin/develop`の`6e38fbbe`から専用作業ツリーと作業ブランチを作成した。
4. 短縮SHAによる取得失敗後、同じコミットの完全SHAを確認して取得し、`cherry-pick`した。
5. 4件の競合を、対象側の製品境界、Scenario/Test追跡、実行スクリプト、権限を維持して解消した。
6. 移植元差分、対象側の補助処理、スキーマ、OpenCode定義、文書、実行スクリプトを照合した。
7. `pnpm gen:openspec`を実行し、生成済み中核定義に差分がないことを確認した。
8. 新検査の直接実行で活動中の`architecture-change`に再利用判断表がないことを確認し、既存の物質的判断を能力単位の表へ移行した。
9. OpenSpec、整形、型、統制、供給網、Agent/Skill定義、コード生成安定性と隔離fixtureを検証し、既存不整合を変更起因の失敗と分離した。

## 残存課題

- `openspec/changes/adopt-behavior-contract-workflow/proposal.md`は既存の提案見出し契約に適合していない。
- `.opencode/plugins/applier-compaction.ts`は既存のESLint型安全性違反15件を持つ。
- `scripts/deploy/generate-deploy-artifacts.test.mjs`は既存READMEに期待するデプロイ用URLがないため1件失敗する。
- 上記はいずれも今回の移植対象外であり、所有者確認済みRequestまたは別の統制作業として扱う必要がある。
