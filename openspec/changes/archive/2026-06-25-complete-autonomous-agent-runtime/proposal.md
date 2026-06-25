## Why

現在の Agent Service は、Cloudflare Workers、`AIAgent` Durable Object、Agent-local Queue、Run scheduler、Context Builder、Harness seam などの土台を持っている。一方で、Event を受けた Agent が Cloudflare 上で実際に model execution を行い、検証済み decision を Agent-owned state へ確定する経路は未完成である。このままでは運用者が Event publish から自律判断、Tool/Memory/Schedule/Delivery/Event commit、監査可能な Run 終了までを確認できない。

この変更は、`1 Agent ID = 1 AIAgent Durable Object instance = 1 AI Agent aggregate root` の境界を保ったまま、自律 Agent 実行基盤を完成状態へ進めるための未完了差分を定義する。特に model policy、Workers AI 実行、Run snapshot、decision commit、budget、observability、Client 管理 UI を安全に接続し、secret、raw prompt、raw completion、raw reasoning を漏えいさせないことを重視する。

## What Changes

- Agent Worker は Workers AI capability を明示的な実行依存として扱い、未設定または利用不能な場合は model execution を安全側で拒否する。
- Agent は Agent-owned model policy を持ち、default policy、Event-scoped override、policy digest/version、安全な metadata、policy RPC を通じて model selection を監査可能にする。
- Agent config は raw model ID ではなく `modelPolicyRef` を参照し、runtime で暗黙の env fallback を行わない。
- PublishEvent は任意の Agent-owned model policy ref を受け付けられるが、未登録、無効、権限外、Integration grant 外の override は受理または Run start の固定点で fail closed する。
- Run は開始時に解決済み model policy identity、decision schema version、Context Builder output、Tool/Memory/config capability generation を immutable snapshot に固定する。
- Run execution loop は model call、typed decision parsing、authorization/budget/stale guard、decision commit、terminal/waiting transition を一貫した実行単位として扱う。
- Harness decisions は Memory、ToolInvocation、Schedule、Delivery、AgentEvent、stop へ接続され、commit 前に idempotency、authorization、budget、generation を検証する。
- Model invocation ledger は raw prompt/raw completion を保存せず、request/response digest、safe model metadata、usage、latency、provider failure、attempt、lease/recovery state を追跡する。
- Management Client は Agent 作成と Settings で default model policy を入力、更新、表示できるが、Agent credential、Provider credential、direct Agent RPC、Agent domain snapshot を Browser または Client D1 に露出しない。
- **BREAKING**: `AgentConfig.modelPolicyRef` が未設定、参照不能、無効、または unsupported provider/model を指す Run は、暗黙 fallback ではなく分類済み失敗として扱われる。

## Spec Units

### New Spec Units

- `agent-model-policy`: Agent-owned model policy の schema、storage、digest/version、default selection、Event override、policy RPC、安全な metadata、secret 非保持を扱う。Security、Client、Run snapshot へ横断するが、正本は Agent-owned policy ref とする。
- `agent-model-invocation`: ModelProvider 境界、Workers AI adapter、Context-to-model request、model output parsing、decision schema version、invocation ledger、lease/recovery、raw reasoning/prompt/completion 非公開を扱う。

### Modified Spec Units

- `agent-platform`: Workers AI binding/env contract と AgentModelPolicyService を Protobuf RPC-only inventory に追加し、既存の binding 分離、generated contract、fail-closed route 方針を維持する。
- `agent-health`: health/smoke が model execution capability の `serving`、`degraded`、`unavailable` を安全な metadata だけで報告するようにする。
- `agent-lifecycle`: InitializeAgent と UpdateConfig/GetConfig が default model policy ref、digest、安全な metadata、config version capture を扱うようにする。
- `agent-eventing`: PublishEvent と Integration ingress Event が optional model policy override ref を受け取り、Thread/Event 正本性を保ったまま検証結果を固定する。
- `agent-runtime`: pending Run scheduler を model execution、snapshot、decision commit、budget、waiting/resume、terminal transition まで接続する。
- `agent-security`: model policy override 権限、Provider/model failure の error mapping、secret/raw prompt/raw completion/raw reasoning を除外する audit/log/response 境界を強化する。
- `agent-memory`: Context Builder と `write_memory` decision が Memory provenance、safe summary、raw reasoning 非保持と整合するようにする。
- `agent-tool`: `invoke_tool` decision、ToolInvocation waiting、Tool result による resume/re-wake、late/stale result rejection を明確化する。
- `agent-schedule`: `create_schedule` decision による Agent-owned Schedule 作成と subsequent Event fire の因果関係を明確化する。
- `agent-integration`: Integration Installation/Adapter/Connection が許可する model policy override 範囲、Delivery result と waiting/resume の扱いを明確化する。
- `client-management`: Agent creation と Settings に default model policy 管理 UI を追加し、安全な policy metadata だけを表示する。
- `client-registry`: Client D1 が model policy の正本 body を保持せず、必要な場合も draft/UI metadata/safe ref に限定することを明確化する。

## Naming

Scenario ID prefix は Spec Unit 名を大文字化したものを使用する。新規 Spec Unit は `AGENT-MODEL-POLICY-S###` と `AGENT-MODEL-INVOCATION-S###` を使用する。既存 Spec Unit の追加 scenario は既存 prefix を継続し、`AGENT-RUNTIME-*`、`CLIENT-MANAGEMENT-*`、`AGENT-SECURITY-*` など責務ごとに分ける。

## Impact

- Agent API contract: TypeSpec、generated proto/RPC descriptors、RPC inventory、model policy service、PublishEvent/config/run snapshot fields。
- Agent runtime: `AIAgent` Durable Object storage、Run scheduler/execution loop、Context Builder、Harness decisions、budget、observability、Workers AI provider seam。
- Agent storage: model policy repository、Run snapshot model policy metadata、model invocation ledger、lease/recovery state、安全な audit metadata。
- Agent operations: Workers AI binding、health/smoke、missing binding/invalid policy/provider failure/malformed output/budget exceeded の分類。
- Management Client: Agent creation/settings UI、Server Actions、server-only Agent RPC、safe policy metadata 表示、Browser secrecy。
- Security: Provider credential、Agent credential、raw prompt、raw completion、raw reasoning、signature/token の非公開継続。
- Tests: Scenario ID に紐づく Agent/Client/governance/unit/smoke tests と codegen drift checks。
