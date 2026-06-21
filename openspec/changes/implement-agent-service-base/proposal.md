## Why

基盤境界が確定しても、Agent が自律的な主体として動くためには、Agent lifecycle、Thread/Event、Run scheduler、Compaction/Memory、Schedule、Tool、Extension、Client 管理 UI までが一貫した domain として実装されている必要がある。単なるチャット Bot や CRUD API ではなく、外部 Event、時刻、内部状態、Tool 結果、人間の入力を受け取り、Agent が自ら次の行動を決める server-side harness が必要である。

この change は、`establish-agent-service-foundation` が適用済みであることを前提に、`docs/memo/仕様設計・アーキテクチャ設定.md` の Stage 1 から Stage 8 までを機能実装としてまとめる。foundation が作成した `packages/agent`、`packages/client`、TypeSpec-to-proto 生成、Connect facade、AIAgent DO foundation、Client D1、guardrail、`packages/agent/src/typespec/src/services/agent-adapter.tsp` を再作成せず、未実装の domain behavior と相互運用を詳細化して上乗せする。Stage 9 の Discord Extension Provider は対象外にしつつ、Extension Provider と相互運用するための Agent 側 RPC、署名、Adapter/Tool/Delivery 境界は Stage 8 までの範囲に含める。

## Foundation Dependency

- この change は `establish-agent-service-foundation` が先に適用・同期されていることに依存する。
- apply phase の最初に foundation output を検証し、不足があればこの change の実装を止めて foundation を先に完了する。
- foundation-only の package restructure、demo removal、Protobuf/Connect guardrail scaffold、`agent-adapter.tsp` の service file 作成を重複実装しない。この change はそれらを前提に、Agent lifecycle、Thread/Event、Run、Compaction/Memory、Schedule、Tool、Extension、Client 管理 UI の Stage 1〜8 機能挙動を実装する。

## What Changes

- foundation の fail-closed service stubs を詳細化し、Agent lifecycle/config/credential/health 操作を Protobuf RPC 経由で提供し、すべての public Agent request を `agent_id` にスコープする。
- AgentEvent は必ず `thread_key` 付きで受理され、同一 Agent ID + 同一 `thread_key` が同一 Thread に解決される。
- `agent_events` は Mailbox 兼 Event Log として扱われ、Agent-local Queue は保存済み Event と pending Run を処理する wake-up mechanism として使われる。
- AgentRun は固定 snapshot を基に一回の harness 実行を行い、初期実装では Agent ごとに active Run を一つに限定する。
- Section/Compaction/History/ThreadMemory/AgentMemory により、長期 Thread を Handoff、詳細 History、出典付き Memory として再開可能にする。
- Schedule、ToolInvocation、Approval、Extension Installation、Adapter Connection、DeliveryContext/AdapterDelivery を AIAgent Durable Object が所有する。
- Provider-facing RPC contract として `ExtensionToolService.InvokeTool/GetOperation/CancelOperation` と `ExtensionDeliveryService.Deliver` を TypeSpec/Protobuf で定義し、Agent から Provider への Tool/Delivery 呼び出しも generated client 経由の signed Connect + binary Protobuf に統一する。
- `AgentThreadService.ListThreads/GetThread/ListSections/GetLatestCompaction/GetThreadMemory/SearchThreadHistory`、`AgentRunService.GetRun/ListRuns/CancelRun`、`AgentStateService.GetState/GetConfig` の公開 query/get/cancel behavior を Agent scope、authorization、pagination、snapshot/metadata、idempotent cancellation の観点で明確化する。
- Client 管理 UI は Agent 一覧、Agent profile、Thread/Event/Run/Compaction、Schedule、Tool approval、Extension install/uninstall、Agent config を server-side Agent RPC 経由で操作する。
- RPC security、replay protection、idempotency、observability、retention、R2 offload、error mapping を Agent domain の横断機能として提供する。
- foundation で除去/非活性化された REST resource API、Agent OpenAPI artifact、Orval Agent SDK、Hono zod-openapi Agent route を再導入せず、Stage 1〜8 の追加機能も Protobuf RPC-only contract に閉じる。

## Spec Units

### New Spec Units

- `agent-lifecycle`: New。Agent initialize/get/destroy、credential rotation、profile/config、Agent ID と Durable Object identity の一致を定義する。
- `agent-eventing`: New。Thread、Section、AgentEvent、Mailbox、idempotency、sequence、thread_key 解決、system Thread を定義する。
- `agent-runtime`: New。AgentRun、scheduler fairness、snapshot immutability、interrupt、harness decision、budget、Agent-local Queue wake を定義する。
- `agent-memory`: New。Section boundary、Compaction、Handoff、ThreadHistory、ThreadMemory、AgentMemory、R2 history/archive、Memory rebase を定義する。
- `agent-schedule`: New。Agent-owned Schedule、thread-scoped trigger Event、overlap policy、Extension uninstall 時の cancel を定義する。
- `agent-tool`: New。ToolDefinition、ToolInvocation lifecycle、approval、signed Provider RPC、async operation reconcile、Tool result Event を定義する。
- `agent-extension`: New。Extension manifest、Installation lifecycle、`AgentExtensionService.CreateAdapterConnection/DeleteAdapterConnection/ListAdapterConnections` による Adapter Connection 管理、ExtensionIngressService、Delivery RPC、uninstall cleanup、Installation signature を定義する。
- `agent-security`: New。Client Service JWT、Extension detached signature、raw body digest、nonce/idempotency replay protection、final Agent-local authorization、Connect error mapping、observability を定義する。
- `agent-health`: New。REST `/health` ではなく `AgentHealthService.Check` RPC で Agent Service と AIAgent routing の health を確認する contract を定義する。
- `client-registry`: New。Client 専用 D1 の管理対象 Agent 台帳、credential reference、server-side Agent RPC client、Agent domain snapshot を保存しない server-side data boundary を定義する。
- `client-management`: New。Next.js 管理 UI の Agent/Thread/Event/Run/Compaction/Schedule/Tool/Extension/Settings 画面、Browser credential 非公開、Agent proxy 非提供を定義する。

### Modified Spec Units

- なし。`openspec/specs` に既存 Spec Unit が存在しないため、この change は新規 Spec Unit の追加のみを行う。

## Naming

- `agent-lifecycle` は `AGENT-LIFECYCLE`、`agent-eventing` は `AGENT-EVENTING`、`agent-runtime` は `AGENT-RUNTIME`、`agent-memory` は `AGENT-MEMORY` を Scenario ID prefix とする。
- `agent-schedule` は `AGENT-SCHEDULE`、`agent-tool` は `AGENT-TOOL`、`agent-extension` は `AGENT-EXTENSION`、`agent-security` は `AGENT-SECURITY`、`agent-health` は `AGENT-HEALTH` を Scenario ID prefix とする。
- `client-registry` は `CLIENT-REGISTRY`、`client-management` は `CLIENT-MANAGEMENT` を Scenario ID prefix とする。
- Automated test title は `[SCENARIO_ID]` を含める。

## Impact

- Agent RPC services: AgentLifecycleService、AgentEventService、AgentThreadService、AgentRunService、AgentStateService、AgentScheduleService、AgentToolService、AgentExtensionService（CreateAdapterConnection、DeleteAdapterConnection、ListAdapterConnections を含む）、`agent-adapter.tsp` で定義される ExtensionIngressService、AgentHealthService。
- Provider-facing RPC services: ExtensionToolService、ExtensionDeliveryService。Agent-side Tool/Delivery interop は含めるが、Discord Provider 本体は含めない。
- Durable Object domain: AIAgent class、DO SQLite schema、Agent-local Queue callbacks、Agent-owned scheduler、R2 references、Workflow/Fiber integration points。
- Security/operations: JWT/signature verification、timestamp/nonce/idempotency tables、grant/scope matrix、rate limits、audit logs、metrics、Connect error mapping。
- Client: Next.js App Router/OpenNext、Server Components/Server Actions、Client D1 schema/migrations、generated Connect client、management UI flows。
- External interoperability: Extension Provider manifest、Adapter ingress、Tool Provider RPC、Delivery RPC、signed callbacks を扱うが、Discord-specific Provider implementation は含めない。
- Root/rules docs: AGENTS.md、CODING_STANDARDS.md、CONTRIBUTING.md、coding-guardian skill/reference を新しい Agent Protobuf RPC-only 構成と package entrypoints に合わせる。
- Testing: contract conformance、RPC security、Agent/thread concurrency、compaction/memory、schedule/tool/extension behavior、Client isolation、UI E2E/component coverage を対象にする。
