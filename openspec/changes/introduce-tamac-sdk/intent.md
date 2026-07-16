Intent-Status: CONFIRMED
Owner-Confirmation: CONFIRMED

## Customer / Owner Outcome

- Actor: TAMAC Agentを組み込むManagement Clientおよび新しいserver-side利用者。
- Situation: Agent lifecycle、Thread、Event、Run、Schedule、Tool、Integration、Healthを同じ契約で操作するとき。
- Problem: RPC、Client Service認証、acting user文脈、error正規化を利用者ごとに再実装すると、安全性と操作体験が分岐する。
- Desired Outcome: 小さいserver-side API surfaceから、認証と監査文脈を保ったTAMAC Agent操作を一貫して開始できる。
- Priority: server-side credential境界、Agent RPC契約との一致、利用APIの一貫性、browser安全性をこの順で優先する。

## Request Classification

| Request Term / Statement                             | Classification            | Confirmed Meaning                                                           |
| ---------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| @cf-tamac/sdk                                        | Required Outcome          | TAMAC Agent操作を提供する第一級のserver-side TypeScript SDKとして公開する。 |
| generated Protobuf RPC                               | Non-negotiable Constraint | AgentのProtobuf RPC-only contractをSDKの通信境界として維持する。            |
| Client Service JWT、acting user、Connect error正規化 | Non-negotiable Constraint | SDK利用者へ共通の認証、監査文脈、error契約を提供する。                      |

## Repository Evidence

| Evidence Type | Source                                               | Observation                                                                                                             | Interpretation                                                                      |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Observed Fact | `openspec/changes/introduce-tamac-sdk/proposal.md:3` | Management Clientと新規server-side Clientが同じ操作体験でAgent機能を扱う成果が定義されている。                          | SDKの目的はwrapper追加ではなく、重複しない一貫したserver-side Agent操作契約である。 |
| Observed Fact | `openspec/changes/introduce-tamac-sdk/proposal.md:9` | SDK API、認証metadata、error正規化、Management Client adapter、browser boundary、deploy artifactが同じscopeに含まれる。 | package APIだけでなくconsumer統合とgovernanceまで完成条件に含まれる。               |

## Inferences and Assumptions

- Inferences: transport、認証、acting user、error変換をSDKへ集約し、Management Client固有の鍵storeはadapter境界に保持する必要がある。
- Assumptions: なし。SDK利用者、公開surface、RPC契約、browser境界、consumer統合は既存の承認済みproposalとSpecsで確定している。
- Unresolved Decisions: なし。public API、security、generated contract、consumer scopeを変更する判断は承認済みartifactへ固定されている。

## Falsification Check

- Materially Different Interpretation: generated RPC clientを再exportするだけの薄いpackageを目的とする解釈。
- Evidence Checked: proposalのWhy、What Changes、Spec Units、Impactを確認した。
- Conclusion: 承認済みscopeは認証、acting user、error正規化、Management Client統合、browser boundaryを要求するため、単純な再exportでは顧客成果を満たさない。

## Invariants and Boundaries

- Invariants: Agent RPC credentialと署名処理をserver-sideに閉じ、generated Protobuf contractを正とし、browserには安全化済みUI dataだけを渡す。
- Boundaries: SDK package、generated descriptors、Management Client adapter、deploy artifacts、governance、tests、documentation、localまたはCI検証をmerge-ready状態へ揃える。

## Observable Success

- server-side利用者は統一されたTypeScript APIからAgent service群を呼び出せる。
- Client Service JWT、acting user文脈、Connect errorが全consumerで同じcontractとして扱われる。
- Management ClientはClient-owned signing key storeをadapterとして利用し、browser bundleへcredentialを含めない。

## Owner Confirmation

- Confirmed Intent: TAMAC Agent操作の認証、監査文脈、error契約を一つのserver-side SDKへ集約し、Management Clientと新規consumerが同じ安全な操作体験を利用できる状態を完成する。
- Confirmation Evidence: 既存のproposalとSpecsを承認済み仕様として保持し、2026-07-16に所有者が全repositoryへIntent workflowを取り込むよう明示指示したため、この確認済み境界を`intent.md`へ移行した。
