## Material Decisions

| Decision                   | Source                                                   | Selected Approach                                                                                                                          | Rationale                                                                                                |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 意図解決と変更成果物の境界 | `WORKSPACE-GOVERNANCE-S025`、`WORKSPACE-GOVERNANCE-S026` | 意図解決を `proposal.md` へ統合し、仕様を観測可能な振る舞い、設計を物質的判断、`tasks.md` を成果単位の Work Package に限定する。           | 独立した意図成果物と詳細な実装計画を永続化せず、依頼から実装までの意味を一箇所で追跡できる。             |
| 変更運用の分類             | `WORKSPACE-GOVERNANCE-S023`、`WORKSPACE-GOVERNANCE-S024` | `Operation Lane`、`UX Mode`、`Review Depth` を独立した三軸として記録し、`BEHAVIOR` と `ARCHITECTURE` に Change と Scenario ID を要求する。 | 変更の性質、利用者体験、確認深度は相関しても同一ではなく、独立検査が誤った省略を防ぐ。                   |
| OpenSpec 生成物の所有権    | 提案の Required Means                                    | `@fission-ai/openspec` を `1.8.0` に固定し、公式6コマンドと6スキルをリポジトリの生成器から再生成する。                                     | 公式生成物の手編集によるドリフトを防ぎ、移植元との一致を再現できる。                                     |
| 対象固有の責務境界         | 提案の Outcome Constraint                                | 補足エージェント、スキル、文書、検査を Agent、管理クライアント、SDK、TypeSpec、Protobuf、RPC、配布境界へ適合させる。                       | 移植元の一般的な運用判断を保持しながら、対象に存在しないフロントエンド・バックエンド境界の再導入を防ぐ。 |
| 実効仕様の追跡             | 提案の Material Constraints                              | 主仕様へ全活動中差分を重ね、重複、欠落、孤立、競合を Scenario ID 単位で検査する。                                                          | 活動中 Change 同士の矛盾をアーカイブ時まで見逃さず、仕様と試験の対応を継続的に保証できる。               |

## Reuse Assessment

| Spec Unit            | Reusable Capability     | Source Classification | Decision | Selected Reuse / Version                                           | Research Evidence                                                | Limited Complement Justification |
| -------------------- | ----------------------- | --------------------- | -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------- |
| workspace-governance | 変更運用の分類          | REPOSITORY_CODE       | REUSE    | `docs/change-operation.md` @ `fe387ffb`                            | `docs/report/research/26/08/25/053040-scoped-reuse-decisions.md` | N/A                              |
| workspace-governance | OpenSpec中核定義生成    | DIRECT_DEPENDENCY     | REUSE    | `@fission-ai/openspec` @ `1.8.0`                                   | `docs/report/research/26/08/25/053040-scoped-reuse-decisions.md` | N/A                              |
| workspace-governance | OpenSpec成果物検査      | REPOSITORY_CODE       | REUSE    | `scripts/openspec/**` @ `fe387ffb`                                 | `docs/report/research/26/08/25/053040-scoped-reuse-decisions.md` | N/A                              |
| workspace-governance | 対象固有の責務委任      | REPOSITORY_CODE       | REUSE    | `.opencode/agents/**`と`.opencode/skills/openspec/**` @ `fe387ffb` | `docs/report/research/26/08/25/053040-scoped-reuse-decisions.md` | N/A                              |
| workspace-governance | ScenarioとE2E試験の追跡 | REPOSITORY_CODE       | REUSE    | `scripts/openspec/verify-scenario-coverage.mjs` @ `6e38fbbe`       | `docs/report/research/26/08/25/053040-scoped-reuse-decisions.md` | N/A                              |

## Boundaries

- 公式 OpenSpec コマンドとスキルは生成器が所有し、リポジトリ固有の補足判断は別のエージェント、スキル、方針文書が所有する。
- OpenSpec は観測可能な振る舞いを所有し、Required Means は提案と設計の制約に限定する。
- `DIRECT` は観測可能な振る舞いと物質的構造を変えない作業だけを扱う。`BEHAVIOR` は `behavior-change`、`ARCHITECTURE` は `architecture-change` を使用する。
- UI変更は `UX Mode: SHAPE` だけでなく、プロダクトデザイナー関与、実ブラウザ確認、デスクトップ・モバイルの変更前後証跡を必要とする。
- アプリケーション実装、アプリケーション試験、生成済み RPC 記述子はこの Change の所有範囲外とする。
- 配布・リリース機能の実装は `make-delivery-opt-in-and-automate-releases` が所有する。

## Data

- 製品データ、永続化形式、外部環境の状態は変更しない。
- リポジトリ内では、完了済み Change を内容保持のアーカイブへ移し、永続的な要件を主仕様へ同期する。
- 活動中 Change と主仕様の Scenario ID は実効仕様として読み取り、検査時だけ重ね合わせる。検査器は仕様を書き換えない。

## Security

- PR検査は同一リポジトリのPR本文だけを読み、明示実行時は対象PRの先頭 SHA と要求された SHA の一致を確認する。
- 外部から提供されたPRコード、資格情報、生成済みブラウザー状態を実行または保存しない。
- Agent、管理クライアント、SDK の既存の資格情報、署名、ブラウザー公開情報、生成物所有権を統治検査で維持する。
- supply-chain の公開後72時間制約、パッケージ単位のビルド許可、全ビルドスクリプト許可の禁止を維持する。

## Migration

- OpenSpec を `1.8.0` に固定し、公式生成器でコマンドとスキルを一括再生成する。
- 完了済み Change をアーカイブし、一意な永続要件と Scenario を主仕様へ同期する。
- 活動中 release Change を `architecture-change` へ移し、意図、提案、設計、作業台帳を新しい責務へ再分類する。
- 方針文書、OpenCode 定義、PR契約、検査器を対象固有の責務境界へ同時に切り替える。旧運用との併存期間は設けない。

## Rollback

- 製品データを変更しないためデータ切り戻しは不要とする。
- 採用前に重大な欠陥が検出された場合は、この Change が所有する方針、OpenSpec、OpenCode、文書、統治試験の変更全体を一単位で取り消す。旧運用と新運用を混在させる部分的な切り戻しは行わない。

## Failure Modes

- 固定版と異なる OpenSpec が生成物を書き換えた場合、移植元との生成物比較と OpenCode 検証が失敗する。
- 提案が未解決のまま後続成果物を持つ場合、提案検査が失敗する。
- 作業台帳または設計へ詳細な実装計画が混入した場合、作業範囲検査が失敗する。
- 主仕様と活動中差分の Scenario ID が重複、欠落、孤立、競合した場合、Scenario網羅性検査が失敗する。
- PR本文の変更運用、追跡情報、UI証跡が不足した場合、PR本文検査が失敗する。
- release Change の未実装 Scenario は、実装試験が追加されるまで全活動中差分の Scenario網羅性検査を失敗させる。

## Risks

- アーカイブ済み認証 Change の `AGENT-MANAGEMENT-UI-S019` と `AGENT-MANAGEMENT-UI-S020` は、主仕様で既に別の管理画面 Scenario に割り当てられている。重複 Scenario を主仕様へ追加せず要件本文を同期したため、IDを共有する複数試験の意味対応には曖昧さが残る。アプリケーション試験を変更しない制約の範囲では、実効仕様のID一意性を優先する。
- 公式生成器の再実行後は、利用中の OpenCode または統合開発環境を再起動しなければ新コマンド定義が読み直されない場合がある。
- 変更運用を一括切り替えするため、旧手順を前提とした未追跡の個人用手順は自動移行されない。

## Verification

- OpenSpec の両スキーマ、全仕様、提案、作業範囲、選択した Change の Scenario網羅性を厳格検査する。
- 公式生成物を移植元と比較し、全 OpenCode エージェント・スキルを専用検証器で検査する。
- PR本文の有効・無効な変更運用、OpenSpec追跡、UI証跡を実際のワークフロー検査処理へ入力する。
- 整形、ESLint、統治、supply-chain、型検査、生成物安定性、全試験、全ビルドを実行する。
- 全活動中差分の Scenario網羅性については、release Change の未実装 Scenario だけが既知の失敗として報告されることを確認する。

## Revisit Triggers

- OpenSpec の固定版または公式生成物の構造が変わった場合、生成所有権と検証方式を再検討する。
- 新しい製品境界または外部契約が追加された場合、対象固有の OpenCode 役割と統治入口を再検討する。
- 変更運用の三軸では表現できない独立した判断軸が実例で確認された場合、PR契約と経路指定を再検討する。
- アプリケーション試験の Scenario ID を変更できる承認済み範囲が成立した場合、`AGENT-MANAGEMENT-UI-S019` と `AGENT-MANAGEMENT-UI-S020` の意味衝突を解消する。
