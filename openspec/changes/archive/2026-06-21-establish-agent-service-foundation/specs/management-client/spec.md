## ADDED Requirements

### Requirement: Server-side management UI shell

Management Client は、Agent credential や direct Agent RPC invocation を Browser code へ露出せず、server-side Agent management shell を render MUST。

**Customer Context**

Agent 管理者は Browser から管理画面を開き、管理対象 Agent の登録状態を確認したい。一方で Agent credential や Agent RPC への直接呼び出しコードが Browser に渡ると、認証情報の露出や権限境界の混同が起きる。

**Requirement**

`packages/client` は、Cloudflare-compatible Next.js adapter を通じて Cloudflare Workers に deploy される Next.js App Router management UI SHALL。

Browser-visible UI は、Client pages と server-side execution boundaries を通じて render SHALL。

Agent RPC invocation は、generated Protobuf RPC client code を使う Client server-side modules から発生 SHALL。

Browser-delivered bundles は、Agent credential material または direct Agent RPC invocation logic を含んで MUST NOT。

Server Actions と Server Components は internal UI execution boundaries のみ SHALL であり、public Agent domain APIs として扱って MUST NOT。

Client App Router は `/agents`、`/agents/new`、`/agents/[agentId]`、`/agents/[agentId]/threads`、`/agents/[agentId]/events`、`/agents/[agentId]/schedules`、`/agents/[agentId]/tools`、`/agents/[agentId]/integrations`、`/agents/[agentId]/settings` の shell routes を含む SHALL。

#### Scenario: Agent registry shell renders for a browser user (MANAGEMENT-CLIENT-S001)

- **GIVEN** browser user が management Client を開く
- **WHEN** `/agents` route が render される
- **THEN** page は Agent registry shell、empty-state guidance、Agent registration と Agent detail section shells への links または navigation affordances を表示する
- **AND** `hello` または `users` demonstration content を表示しない

#### Scenario: Browser bundles do not call Agent RPC directly (MANAGEMENT-CLIENT-S002)

- **GIVEN** Client production build が利用できる
- **WHEN** browser-delivered chunks を検査する
- **THEN** Agent RPC origin invocation code と Agent credential material はそれらの chunks に存在しない
- **AND** Agent RPC client construction は server-side modules からのみ到達可能である

### Requirement: No public Agent API proxy from Client

Management Client は、Agent API の代理公開者ではなく、server-side UI execution boundary から Agent RPC を呼び出す利用者であることを維持 MUST。

**Customer Context**

管理者は Browser から Client UI を操作するが、Client が `/api/client/*` や Agent REST proxy を公開すると、Agent Service の Protobuf RPC-only 契約、credential 分配、authorization model が二重化する。運用者は UI 内部の Server Actions / Server Components と、公開 Agent API contract を明確に分けたい。

**Requirement**

Client Worker は Agent API proxy routes を公開 MUST NOT。

Client Worker は `/api/client/*` Agent management APIs、`/api/agent*` Agent REST proxy routes、managed Agents 向け arbitrary RPC forwarding routes を公開 MUST NOT。

Server Actions と Server Components は management Client の internal UI execution boundaries に留まる SHALL。これらを public Agent domain API endpoints として document、generate、test SHALL NOT。

Client UI navigation と Browser network behavior は management pages と form/action interactions だけを公開 SHALL。Direct Agent REST proxy calls と Agent RPC credential forwarding は browser-visible routes から存在 MUST NOT。

#### Scenario: Client exposes no Agent API proxy routes (MANAGEMENT-CLIENT-S008)

- **GIVEN** Client route manifest、App Router route handlers、browser-visible network behavior を検査できる
- **WHEN** `/api/client/*`、`/api/agent*`、Agent REST proxy paths、arbitrary Agent RPC forwarding handlers を列挙する
- **THEN** public Agent API proxy route は存在しない
- **AND** Server Actions と Server Components は internal UI execution boundaries としてのみ到達可能である
- **AND** Browser-visible requests は Client-owned API routes を通じて Agent credentials または arbitrary Agent RPC calls を forwarding できない

### Requirement: Client-owned management ledger

Client Worker は Client-owned management ledger data のみを Client D1 に保存 MUST。

**Customer Context**

管理 Client は、どの Agent を管理対象として表示するか、どの RPC origin を使うか、どの credential reference を参照するかを保持する必要がある。ただし Agent の Thread、Event、Run、Schedule、ToolInvocation、Integration Installation などの正本データを複製すると、管理 UI と Agent Service の所有権が衝突する。

**Requirement**

Client Worker は management metadata 用の `CLIENT_DB` D1 binding を所有 SHALL。

Client D1 は `agent_id`、`agent_rpc_origin`、display metadata、ordering metadata、timestamps、last-opened metadata を持つ managed Agent records を保存 SHALL。

Client D1 は `agent_id`、`credential_ref`、key metadata、masked hints、status、timestamps を持つ Agent credential references を保存 SHALL。

Client D1 は AgentEvent、ThreadMemory、AgentState、Schedule、ToolInvocation、Integration Installation、Adapter Connection、Compaction bodies などの Agent-domain snapshots を保存 MUST NOT。

#### Scenario: Client D1 exposes only management tables (MANAGEMENT-CLIENT-S003)

- **GIVEN** Client D1 schema を検査できる
- **WHEN** table names と columns を列挙する
- **THEN** managed Agent と credential reference tables は management metadata columns とともに存在する
- **AND** Agent-domain snapshot tables は存在しない

#### Scenario: Client repository rejects Agent-domain snapshot persistence (MANAGEMENT-CLIENT-S004)

- **GIVEN** Client server-side persistence modules が Agent events または Agent state snapshots に似た data を受け取る
- **WHEN** その data を Client D1 repository APIs に渡す
- **THEN** repository APIs はそれらの Agent-domain snapshots 用 write operations を提供しない
- **AND** tests は management ledger writes だけが利用可能であることを assert する

### Requirement: Agent and Client package separation

Agent package と Client package は independently deployable であり、runtime-source coupling から自由である状態を維持 MUST。

**Customer Context**

運用者は Agent Worker と Client Worker を別々に deploy、rollback、権限制御できる必要がある。Client が Agent runtime source を import したり、Agent が Client D1 binding を持ったりすると、独立運用とセキュリティレビューが難しくなる。

**Requirement**

Client Worker は、Agent Worker から分離された own package、Worker configuration、build command、deploy command を持つ SHALL。

Client Worker は `CLIENT_DB` と Client credential secret references を定義 SHALL。

Client Worker は `AI_AGENT` Durable Object binding を定義 MUST NOT。

Client source は Agent runtime source を import MUST NOT。

Agent source は Client runtime source を import MUST NOT。

Client 用 generated Agent RPC client code は `packages/client/src/generated/agent-rpc` に配置 SHALL し、Agent proto generation pipeline によって生成 SHALL。

#### Scenario: Client Worker binding set is isolated from Agent runtime (MANAGEMENT-CLIENT-S005)

- **GIVEN** Client Worker configuration を検査できる
- **WHEN** bindings を列挙する
- **THEN** `CLIENT_DB` と Client credential secret references は存在する
- **AND** `AI_AGENT` Durable Object bindings と Agent-owned storage bindings は存在しない

#### Scenario: Client imports generated Agent RPC code without Agent runtime source (MANAGEMENT-CLIENT-S006)

- **GIVEN** Client source graph を検査できる
- **WHEN** server-side Agent RPC modules を解決する
- **THEN** imports は generated Agent RPC client code または Connect runtime packages を対象にする
- **AND** imports は `packages/agent/src` runtime modules を対象にしない

### Requirement: Demo-free management experience

Management Client は `hello` または `users` demonstration experiences を含めずに Agent management routes を表示 MUST。

**Customer Context**

Agent 管理者は Agent registry、Agent RPC origin、credential reference の管理を開始点にしたい。実演用の `hello` や `users` 画面が残ると、management Client の責務が business demo と混同され、以後の Agent 管理 UI の情報設計が崩れる。

**Requirement**

Client UI routes は Agent registry、registration、detail overview、threads、events、schedules、tools、integrations、settings foundations 用の Agent management shell routes を表示 SHALL。

Client UI は `hello` または `users` demonstration pages、navigation items、mock handlers、tests を production management experiences として表示 MUST NOT。

Replacement verification 後の active workspace は management Client UI と server-side execution を `packages/client/**` に集約 SHALL し、旧 demo UI package graph を documented route surface、workspace package patterns、lint boundary elements として残して MUST NOT。

Initial empty states は users に `agent_id`、Agent RPC origin、credential reference の登録を案内 SHALL し、Agent detail section shells は Agent-domain snapshots を Client D1 に永続化せずに render SHALL。

#### Scenario: Management routes contain no demo navigation (MANAGEMENT-CLIENT-S007)

- **GIVEN** Client route configuration と primary navigation を検査できる
- **WHEN** available management routes を列挙する
- **THEN** Agent registry、registration、detail overview、threads、events、schedules、tools、integrations、settings shell routes が存在する
- **AND** `hello` と `users` demonstration routes は存在しない
- **AND** Client route graph は旧 demo UI package graph へ依存しない
