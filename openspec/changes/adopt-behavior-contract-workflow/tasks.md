## Work Packages

- [x] WP1: 成果指向の OpenSpec 変更契約と再現可能な公式生成経路を完成する
  - Covers: `WORKSPACE-GOVERNANCE-S025`、`WORKSPACE-GOVERNANCE-S026`、意図解決と変更成果物の境界、OpenSpec 生成物の所有権
  - Completion Evidence: `pnpm gen:openspec`、両スキーマの厳格検査、`pnpm test:openspec-rules`、選択した Change の提案・作業範囲・Scenario網羅性検査が成功し、公式6コマンド・6スキルが移植元と一致する

- [x] WP2: 対象固有の三軸変更運用と追跡可能なPR・OpenCode経路を完成する
  - Covers: `WORKSPACE-GOVERNANCE-S023`、`WORKSPACE-GOVERNANCE-S024`、変更運用の分類、対象固有の責務境界
  - Completion Evidence: PR本文の有効・無効な入力を扱う統治試験、`pnpm lint:governance`、全 OpenCode エージェント・スキルの検証が成功する

- [x] WP3: 既存仕様・活動中Changeを新運用へ整合させ、リポジトリ全体の健全性を維持する
  - Covers: 実効仕様の追跡、完了済みChangeのアーカイブ、release Changeの成果物移行、アプリケーション実装を変更しない境界
  - Completion Evidence: `pnpm format:check`、`pnpm lint:eslint`、`pnpm lint:supply-chain`、`pnpm check`、`pnpm check:codegen`、`pnpm test:run`、`pnpm build` が成功し、全活動中差分の Scenario網羅性検査では未実装の release Change だけが不足として報告される
