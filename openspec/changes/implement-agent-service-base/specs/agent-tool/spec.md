## ADDED Requirements

### Requirement: Tool 定義と可用性

AIAgent Durable Object は、版管理された Agent-local Tool カタログを維持 SHALL。

**利用者文脈**

Agent は外界へ作用するために Tool を呼ぶが、どの Tool が使えるか、どの入力/出力スキーマを持つか、承認が必要かを実行時に説明できなければならない。Integration が Tool を追加しても Agent の所有境界と認可が崩れてはならない。

**要件**

- AIAgent Durable Object は、各 Agent の有効な ToolDefinition カタログを所有 MUST。
- ToolDefinition は安定 ID、版、表示名、説明、入力スキーマ、出力スキーマ、既定の承認要否、任意の `installation_id`、RPC 対象を含める MUST。
- Tool の利用可否は版管理され、AgentRun スナップショットが判断時に使用した Tool 集合を記録できるようにする MUST。
- 無効、revoked、またはアンインストール済み状態の Integration Tool は、新しい Run から呼び出し可能であって MUST NOT。

#### Scenario: ListTools が Agent-local の利用可能な Tool カタログを返す (AGENT-TOOL-S001)

- **GIVEN** ある Agent に組み込み Tool と有効な Integration 提供 Tool がある
- **WHEN** 認可済み Client Service principal が `ListTools` を呼ぶ
- **THEN** 応答は、その Agent で利用可能な Tool definition を版、承認ポリシー、Installation 所有関係、対象メタデータとともに返す
- **AND** 無効またはアンインストール済み状態の Installation 由来の Tool は、照会条件に従って除外されるか、明示的に利用不可として示される

#### Scenario: 無効状態の Integration Tool は新しい Run から呼び出せない (AGENT-TOOL-S002)

- **GIVEN** Tool `calendar.create_event` が Integration Installation `inst-1` に属している
- **WHEN** 新しい Run が開始する前に `inst-1` が無効またはアンインストール済みになる
- **THEN** その Tool は Run の利用可能 Tool 集合スナップショットに含まれない
- **AND** 呼び出しを試みた場合は capability 事前条件エラーとして拒否される

### Requirement: ToolInvocation ライフサイクルと承認

ToolInvocation はライフサイクル、所有関係、承認、監査状態を追跡 SHALL。

**利用者文脈**

Tool は外部 system に作用するため、実行状態、承認、入力/出力、再試行、失敗理由を追跡できる必要がある。人間の承認が必要な Tool は、明示的な承認なしに実行されてはならない。

**要件**

- ToolInvocation は一つの Agent、Thread、Run に所属 MUST。
- ToolInvocation はライフサイクル状態として `proposed`、`pending_approval`、`approved`、`running`、`succeeded`、`failed`、`outcome_unknown`、`cancelled` を追跡 MUST。
- ToolInvocation は Tool ID、該当する場合の Installation ID、idempotency key、入力/出力参照、`status`、承認記録、試行回数、時刻、因果 Event/Run link を含める MUST。
- 承認と却下の command は、認可済み Client Service scope を要求 MUST し、監査 Event として記録 MUST。

#### Scenario: 承認が必要な ToolInvocation は実行前に待機する (AGENT-TOOL-S003)

- **GIVEN** Run が、definition で既定の承認を要求する Tool の呼び出しを決定している
- **WHEN** ToolInvocation が作成される
- **THEN** その `status` は `pending_approval` になる
- **AND** 認可済み承認が記録されるまで Provider RPC は送信されない
- **AND** 承認待ちは ToolInvocation 照会 RPC から確認できる

#### Scenario: 認可済み承認が ToolInvocation 状態を遷移させる (AGENT-TOOL-S004)

- **GIVEN** ToolInvocation が `pending_approval` である
- **WHEN** 認可済み Client Service principal が `ApproveInvocation` を呼ぶ
- **THEN** 承認記録は実行者、時刻、判断、任意の理由を記録する
- **AND** ToolInvocation は `approved` に遷移し、実行対象になれる
- **AND** 認可されていない承認または却下の試行は、状態を変えずに拒否される

### Requirement: 署名付き Tool Provider RPC

Agent-to-Provider Tool 呼び出しは、署名付き Protobuf RPC メタデータを使用 SHALL。

**利用者文脈**

Integration Provider が Tool を実装する場合、Agent から Provider への呼び出しも改ざん・なりすまし・replay を防ぐ必要がある。Provider は Agent が発行した正当な ToolInvocation であることを検証できなければならない。

**要件**

- Agent-to-Provider Tool リクエストは、必須 profile として Connect + binary Protobuf を用いる Protobuf RPC を使用 MUST。
- Agent API TypeSpec は、unary `InvokeTool`、`GetOperation`、`CancelOperation` method を持つ Provider-facing `IntegrationToolService` を `packages/agent/src/typespec/src/services/integration-tool.tsp` または同等の service module で定義 MUST。
- AIAgent Durable Object は、生 ad-hoc JSON や REST リクエストではなく、生成済み Protobuf client descriptor を通じて Integration Tool Provider を呼び出す MUST。
- Tool Provider RPC リクエストは Agent-controlled 署名 material により署名 MUST し、signature base に service、method、`agent_id`、`installation_id`、`tool_id`、`invocation_id`、時刻、nonce、idempotency key、生 protobuf body digest を含める MUST。
- AIAgent Durable Object は送信リクエスト digest、nonce、試行、存在する場合の Provider operation ID、timeout/retry policy を保存 MUST。
- Tool Provider 応答は、結果状態を確定する前に想定 invocation identity と照合して検証 MUST。

#### Scenario: Agent が署名付き binary Protobuf RPC で Integration Tool を呼び出す (AGENT-TOOL-S005)

- **GIVEN** `approved` 状態の ToolInvocation が Integration Provider Tool エンドポイントを対象にしている
- **WHEN** AIAgent Durable Object が invocation を実行する
- **THEN** 生成済み Provider client を通じて、binary Protobuf でエンコードされた Connect unary RPC として `IntegrationToolService.InvokeTool` を送信する
- **AND** リクエストには invocation identity と生 body digest を対象に含む signature メタデータが含まれる
- **AND** 送信試行は digest、nonce、Provider 対象とともに記録される

### Requirement: Tool 結果と照合

Tool 結果は発生元 Thread に戻り、照合を支援 SHALL。

**利用者文脈**

Tool の結果は Agent の次の判断に入る Event でなければならない。外部 timeout で結果が不明な場合も、同一 invocation identity で後から照会・収束できる必要がある。

**要件**

- Tool の成功または失敗は、ToolInvocation と同じ Thread に `tool.invocation.succeeded` または `tool.invocation.failed` AgentEvent を追加 MUST。
- Tool 結果 payload は、サイズ閾値に従って inline または digest メタデータ付き immutable R2 参照として保存 MUST。
- timeout または曖昧な失敗の後で外部実行結果が不明な場合、ToolInvocation は `outcome_unknown` に入り、`IntegrationToolService.GetOperation` を通じた Provider operation 照合を支援 MUST。
- `running` または不明な Provider operation の取消は、Provider operation identity が既知で Tool definition が取消を許可する場合に `IntegrationToolService.CancelOperation` を呼び出す MUST。
- 照合は、同じ invocation 結果に対して重複する成功/失敗 Event を作成して MUST NOT。

#### Scenario: Tool result Event が同じ Thread に戻る (AGENT-TOOL-S006)

- **GIVEN** ToolInvocation `inv-1` が Thread A と Run `run-1` に属している
- **WHEN** Provider が成功結果を返す
- **THEN** ToolInvocation `inv-1` は `succeeded` になる
- **AND** `run-1` と `inv-1` への因果 link を持つ `tool.invocation.succeeded` AgentEvent が Thread A に追加される
- **AND** 結果 Event のための pending Run work が作成または coalesce される

#### Scenario: 不明な Tool 結果が operation 状態で照合される (AGENT-TOOL-S007)

- **GIVEN** Provider が operation を受理した可能性がある後に Tool Provider RPC が timeout する
- **WHEN** AIAgent Durable Object が RPC 応答から結果を判定できない
- **THEN** ToolInvocation は `outcome_unknown` になる
- **AND** 照合は、同じ invocation identity と、存在する場合は Provider operation ID を使って `IntegrationToolService.GetOperation` を呼ぶ
- **AND** 最終的な `succeeded`、`failed`、または `cancelled` 状態は、重複する結果 Event なしで一度だけ確定される

#### Scenario: Tool 取消が Provider operation に伝播する (AGENT-TOOL-S008)

- **GIVEN** ToolInvocation `inv-2` が取消をサポートする `running` Provider operation を持っている
- **WHEN** 認可済み取消または interrupt policy が `inv-2` を cancel する
- **THEN** AIAgent Durable Object は、署名済み binary Protobuf メタデータ付きで生成済み Provider client を通じて `IntegrationToolService.CancelOperation` を呼ぶ
- **AND** ToolInvocation は重複する結果 Event を追加せず、取消試行、Provider operation identity、最終的な `cancelled` または `outcome_unknown` 状態を記録する
