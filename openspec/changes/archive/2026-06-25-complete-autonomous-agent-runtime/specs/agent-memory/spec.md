## ADDED Requirements

### Requirement: Model context and memory decision provenance

Model context と memory decision は provenance と raw reasoning 非保持を維持 MUST。

**Customer Context**

Agent が model へ渡す Memory と History は、判断品質と説明可能性の中心である。Memory 更新が provenance なしで上書きされたり、reasoning-like text が保存されたりすると、運用者は判断根拠を検証できない。

**Requirement**

Context Builder は model request assembly へ渡す bundle に ThreadMemory version、latest ready Handoff、retrieved History references、AgentMemory version、trigger Event identity を含める SHALL。Bundle は raw body の代わりに必要な safe content と digest/reference metadata を使用 MUST。

`write_memory` decision は ThreadMemory または AgentMemory の add、confirm、revise、supersede、invalidate operation として commit SHALL。Memory update は Run ID、decision ID、source Event、History reference、model policy digest、decision schema version への provenance を保持 MUST。Silent overwrite は許可して MUST NOT。

Memory storage、History、Compaction、audit、Client UI は raw chain-of-thought、hidden reasoning、raw prompt、raw completion を保存または表示して MUST NOT。Reasoning-like text が入力に現れる場合は、保存可能な safe summary または decision record に正規化 MUST。

#### Scenario: Context Builder が model input 用 metadata を保持する (AGENT-MEMORY-S009)

- **GIVEN** Thread A が ThreadMemory、ready Handoff、History references、AgentMemory を持っている
- **WHEN** Run snapshot から model request bundle が作成される
- **THEN** bundle は各 Memory/History source の version、digest、provenance reference を保持する
- **AND** raw History body と raw prompt は audit や Client UI に保存されない

#### Scenario: write_memory decision が provenance 付き Memory update を作成する (AGENT-MEMORY-S010)

- **GIVEN** Model output parser が valid `write_memory` decision を返している
- **WHEN** commit layer が decision を検証して Memory update を適用する
- **THEN** ThreadMemory または AgentMemory は operation、Run ID、decision ID、source Event/History、policy digest を持つ版として保存される
- **AND** supersede/invalidate lineage は照会可能であり、raw reasoning は保存されない
