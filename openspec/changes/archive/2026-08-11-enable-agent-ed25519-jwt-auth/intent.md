Intent-Status: CONFIRMED
Owner-Confirmation: CONFIRMED

## Customer / Owner Outcome

- Actor: cf-tamacを自己ホストし、Agent WorkerとManagement Clientを運用する管理者。
- Situation: ClientからAgentを安全に管理し、署名鍵の生成、交代、失効、復旧、診断を継続運用するとき。
- Problem: Client Service認証が署名鍵lifecycle、Agent trust、監査、復旧まで一貫した契約を持たなければ、本番環境の管理境界を安全に維持できない。
- Desired Outcome: Management Clientが秘密署名鍵をserver-sideで安全に管理し、Agentが公開情報だけのtrust設定からClient Service requestを検証できる。
- Priority: 秘密鍵非露出、失敗時拒否、鍵lifecycle、監査可能性、運用復旧をこの順で優先する。

## Request Classification

| Request Term / Statement          | Classification            | Confirmed Meaning                                                        |
| --------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Ed25519 JWT                       | Non-negotiable Constraint | Agent本番Client Service認証の署名・検証方式として維持する。              |
| AGENT_CONTROL_PLANE_TRUST         | Non-negotiable Constraint | Agentが公開鍵、issuer、scope、許可Agentを検証するtrust契約の正本とする。 |
| Signing KeysとTrust Config Export | Required Outcome          | Agentが0件でも鍵を準備し、秘密情報を含まないtrust設定を生成できる。      |

## Repository Evidence

| Evidence Type | Source                                                         | Observation                                                                                     | Interpretation                                                                               |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Observed Fact | `openspec/changes/enable-agent-ed25519-jwt-auth/proposal.md:3` | 自己ホスト環境で初期設定RPCやCLIに依存せずClientからAgentを安全に管理する成果が定義されている。 | 中心価値は暗号方式単体ではなく、自己ホスト運用可能なservice authentication lifecycleである。 |
| Observed Fact | `openspec/changes/enable-agent-ed25519-jwt-auth/proposal.md:9` | trust設定、JWT検証、鍵store、管理UI、health、運用契約が同一scopeに含まれる。                    | Agent、Client、UI、governanceを一つのsecurity境界として完成させる必要がある。                |

## Inferences and Assumptions

- Inferences: 秘密鍵をbrowserやAgentへ渡さず、Client server-side signingとAgent public-key verificationを分離することが顧客成果に必要である。
- Assumptions: なし。認証方式、trust形式、鍵lifecycle、UI、診断、運用境界は既存の承認済みproposalとSpecsで確定している。
- Unresolved Decisions: なし。security、contract、persistence、UI、scopeを変更する判断は承認済みartifactへ固定されている。

## Falsification Check

- Materially Different Interpretation: 単一のJWT verifier追加だけで完了し、鍵管理と運用UIを別scopeとする解釈。
- Evidence Checked: proposalのWhat Changes、Spec Units、Impactを確認した。
- Conclusion: 承認済みscopeは鍵生成からAgent検証、交代、失効、復旧、監査までのlifecycleを要求するため、verifier単体の解釈は一致しない。

## Invariants and Boundaries

- Invariants: private keyをbrowser、Agent、logへ露出せず、未知・失効済みkey、scope不一致、replayを失敗時拒否で扱う。
- Boundaries: Agent contract/runtime、Client server/persistence/UI、generated outputs、governance、tests、documentation、localまたはCI検証をmerge-ready状態へ揃える。

## Observable Success

- 管理者はAgentが0件でもsigning keyを生成し、public-only trust configをexportできる。
- Clientはserver-sideでJWTを署名し、Agentはtrust設定とrequest文脈を検証して許可済みRPCだけを処理する。
- 鍵交代、失効、復旧、health診断、監査が秘密情報を露出せず実行可能になる。

## Owner Confirmation

- Confirmed Intent: 自己ホスト環境で秘密鍵を安全に管理し、Agentが公開trust設定からClient Service requestを検証できるEd25519 JWT認証lifecycleを完成する。
- Confirmation Evidence: 既存のproposalとSpecsを承認済み仕様として保持し、2026-07-16に所有者が全repositoryへIntent workflowを取り込むよう明示指示したため、この確認済み境界を`intent.md`へ移行した。
