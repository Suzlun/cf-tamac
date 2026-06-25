## ADDED Requirements

### Requirement: Client model policy metadata boundary

Client registry は model policy body を Agent-owned 正本として扱い、Client D1 へ複製して MUST NOT。

**Customer Context**

Management Client は model policy を扱う UI を提供するが、Agent-owned model policy body や credential を Client D1 の正本として複製すると、Agent aggregate boundary と secret 管理が崩れる。

**Requirement**

Client D1 は Agent-owned model policy body を authoritative state として保存して MUST NOT。Client D1 が model policy に関する値を保持する場合、draft form metadata、safe policy ref、last seen digest、provider/model 表示 metadata、validation timestamp など UI 補助情報に限定 MUST。

Client server は model policy の正本を Agent RPC から取得 SHALL。Client server は policy upsert、validate、archive、config update を generated Agent RPC client と server-only credential resolution 経由で実行 MUST。Browser-visible code は Agent RPC origin への direct request、raw Agent RPC payload construction、credential material、Connect runtime を持って MUST NOT。

#### Scenario: Client D1 は model policy body を正本保存しない (CLIENT-REGISTRY-S009)

- **GIVEN** 運用者が Agent Settings で model policy を編集している
- **WHEN** Client server が UI 補助 metadata を保存する
- **THEN** Client D1 は draft metadata、safe ref、digest、provider/model 表示値だけを保持できる
- **AND** Agent-owned policy body、credentialRef が指す secret value、provider token は保存されない

#### Scenario: Client server は Agent RPC から model policy 正本を読む (CLIENT-REGISTRY-S010)

- **GIVEN** Agent detail page が default model policy metadata を表示する
- **WHEN** Client server がページを描画する
- **THEN** Client server は generated Agent RPC client で Agent-owned policy と config を取得する
- **AND** Browser は安全化された policy metadata だけを受け取り、direct Agent RPC call は行わない
