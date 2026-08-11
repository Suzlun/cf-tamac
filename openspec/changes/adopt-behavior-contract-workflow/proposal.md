Intent-Resolution: REQUEST_SUFFICIENT
UX-Mode: NONE

## Outcome

保守担当者とコーディングエージェントが、変更の性質、利用者体験への影響、確認の深さを混同せず、対象リポジトリの永続的な振る舞い契約に基づいて変更を提案、実装、確認できる。

## Why

従来の変更運用は、確認済み意図を独立した成果物へ固定し、ワイヤーフレームを必須の設計契約として扱っていた。一方、依頼で指定された移植元 commit は、意図解決を提案へ統合し、観測可能な振る舞い、構造変更、利用者体験、確認深度を独立して扱う。対象リポジトリの Agent、管理クライアント、SDK、TypeSpec、Protobuf、RPC、配布境界へこの運用を適合させなければ、移植元と対象で変更判断と検証結果が一致しない。

## Scope

### In Scope

- OpenSpec `1.8.0`、公式コマンド・スキル生成、新しい振る舞い変更・構造変更スキーマを対象リポジトリへ適合させる。
- 変更運用を `Operation Lane`、`UX Mode`、`Review Depth` の独立した三軸で記録し、提案、仕様、設計、作業台帳、PRの検査へ反映する。
- 実際のUI変更におけるプロダクトデザイナー関与、実ブラウザ確認、デスクトップ・モバイルの変更前後証跡を明示する。
- 完了済み Change をアーカイブし、その永続的な要件を主仕様へ同期する。
- Agent、管理クライアント、SDK、TypeSpec、Protobuf、RPC、配布の責務境界に合わせて OpenCode 定義と統治文書を更新する。

### Out of Scope

- アプリケーション実装、未コミットのアプリケーション試験、生成済み RPC 記述子は変更しない。
- `make-delivery-opt-in-and-automate-releases` が契約する配布・リリース機能は実装しない。
- リリース、デプロイ、外部環境変更、資格情報へのアクセスは実行しない。

## Request Classification

| Request Statement                                            | Classification     | Resolution                                                                                    |
| ------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------- |
| 移植元 commit のアーキテクチャを対象リポジトリへ完全移植する | Desired Outcome    | 対象の製品境界と既存変更を維持しながら、変更運用と統治契約を意味移植する。                    |
| 移植元 commit を正確な基準にする                             | Required Means     | commit `93949040cccd5d366a6d66c84e79ff03fc0486d7` の生成物と運用判断を基準にする。            |
| 対象リポジトリのアーキテクチャへ適合させる                   | Outcome Constraint | Agent、管理クライアント、SDK、TypeSpec、Protobuf、RPC、配布境界へ用語と検査対象を置き換える。 |
| アプリケーション実装を変更しない                             | Outcome Constraint | 方針、OpenSpec、OpenCode、文書、統治試験だけを変更対象にする。                                |
| 対象の release Change を新運用へ移行するが実装しない         | Required Means     | Change 成果物だけを新スキーマへ移し、未実装 Scenario は既知の検証失敗として保持する。         |

## Spec Units

### New Spec Units

- なし（理由: 変更運用は既存の `workspace-governance` が永続的に所有するため）。

### Modified Spec Units

- `workspace-governance`: 変更分類、意図解決、OpenSpec 成果物、PR証跡、生成済み OpenCode 定義の契約を更新する。

## UI / UX Impact

利用者向けアプリケーション画面と操作は変更しない。変更対象は保守作業、コーディングエージェントの指示、リポジトリ内検査に限定する。

## Material Constraints

- OpenSpec の公式コマンドと公式スキルは手編集せず、固定した `@fission-ai/openspec` `1.8.0` から生成する。
- `behavior-change` と `architecture-change` を目的別に使い分け、構造変更の手段を製品要件へ変換しない。
- 活動中の差分を含む実効仕様で Scenario ID の重複、欠落、孤立、競合を検査する。
- 既存の supply-chain 制約、生成物所有権、Agent と管理クライアントのセキュリティ境界を弱めない。
- アプリケーション実装と未コミットのアプリケーション試験を変更しない。

## Repository Evidence

| Source                                                                         | Observation                                                                                                                         | Relevance                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/home/suzlun/repos/cfreact-template@93949040cccd5d366a6d66c84e79ff03fc0486d7` | 移植元は OpenSpec `1.8.0`、二つの変更スキーマ、公式6コマンド・6スキル、三軸の変更運用、提案・作業範囲・Scenario検査を導入している。 | 必須手段と一致確認の基準になる。                                                 |
| `packages/agent/src/typespec/main.tsp`                                         | 対象の公開契約は TypeSpec から Protobuf と RPC 記述子へ生成される。                                                                 | 移植元のフロントエンド・バックエンド用語を対象の契約方向へ置き換える必要がある。 |
| `scripts/governance/verify-package-boundaries.mjs`                             | Agent、管理クライアント、SDK、生成物の責務境界を自動検査している。                                                                  | OpenCode 定義と統治スキルを対象固有の境界へ適合させる根拠になる。                |
| `openspec/changes/make-delivery-opt-in-and-automate-releases/`                 | 配布とリリースを扱う活動中 Change が存在し、実装は完了していない。                                                                  | 新運用への成果物移行と、機能実装を対象外にする判断を分離する必要がある。         |

## Assumptions and Decisions

- Assumptions: なし。移植元 commit、対象ディレクトリ、変更可能な方針領域、変更禁止のアプリケーション領域、release Change の扱いは依頼で明示されている。
- Decisions: 移植元の一般的な運用契約は保持し、製品用語と検査入口だけを対象固有の Agent、管理クライアント、SDK、TypeSpec、Protobuf、RPC、配布境界へ適合させる。旧アーカイブは履歴として保持し、現在のスキーマを遡及適用しない。

## Observable Success

- 保守担当者が `DIRECT`、`BEHAVIOR`、`ARCHITECTURE` と `NONE`、`CONTINUITY`、`SHAPE` と `STANDARD`、`DEEP` を独立して記録できる。
- 未解決の提案、詳細すぎる作業台帳、競合または追跡不能な Scenario、未入力のPR証跡が自動検査で拒否される。
- OpenSpec 公式生成物が移植元と一致し、対象固有の OpenCode 定義が Agent、管理クライアント、SDK の境界検査に成功する。
- アプリケーションの全試験、型検査、生成物安定性検査、ビルドが成功する。

## Confirmation Evidence

- 依頼は移植元 commit、対象リポジトリ、対象の製品境界、完全移植の成果、上書き可能な方針領域、変更禁止のアプリケーション領域を具体的に指定している。
