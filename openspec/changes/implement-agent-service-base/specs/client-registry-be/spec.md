## ADDED Requirements

### Requirement: Client-owned managed Agent registry

Client server は Client D1 内の managed Agent registry metadata を所有 SHALL。

**Customer Context**

管理 UI は複数の Agent を扱うが、Agent Service は Agent 横断一覧を提供しない。Client は自分が管理対象として登録した Agent ID、RPC origin、表示設定だけを Client 専用 D1 に持ち、Agent domain 正本を複製しない必要がある。

**Requirement**

- Client server は managed Agents の Client D1 registry を所有 MUST。registry は `agent_id`、Agent RPC origin、display name、pinned flag、sort order、created/updated timestamps、last opened timestamp を保持する。
- Client server は Client-owned server-side code だけを通じて registry を読み書き MUST。
- Agent Service は Client D1 を読み書き MUST NOT。
- Client registry は authoritative Agent domain state として扱われて MUST NOT。

#### Scenario: Managed Agent registry persists display and ordering metadata (CLIENT-REGISTRY-BE-S001)

- **GIVEN** Client operator が Agent RPC origin と display name を指定して `agent-alpha` を登録している
- **WHEN** operator が Agent entry を pin、reorder、rename、または open する
- **THEN** Client D1 は display name、pinned flag、sort order、timestamps、last opened timestamp を永続化する
- **AND** registry だけの更新では Agent Service state は変更されない

### Requirement: Credential reference boundary

Client server は plaintext secret を含めずに credential reference を保存 SHALL。

**Customer Context**

Client は Agent RPC を server-side で呼ぶため credential 参照を管理する必要があるが、private key や raw secret を D1 や Browser に平文で渡すと漏えいにつながる。

**Requirement**

- Client D1 は Agent credential references、key IDs、masked hints、status、timestamps を保存 MUST。plaintext private keys または raw shared secrets は保存しない。
- Client server は server-side execution 内でのみ credential references を解決 MUST。
- Browser responses は Agent credential、raw JWT signing key、Provider private key、raw shared secret を含んで MUST NOT。

#### Scenario: Credential reference stores no plaintext secret (CLIENT-REGISTRY-BE-S002)

- **GIVEN** operator が `agent-alpha` の Client-side credential reference を保存または rotate している
- **WHEN** Client server が credential metadata を永続化する
- **THEN** D1 には credential reference、key ID、masked hint、status、timestamps だけが含まれる
- **AND** plaintext private key または raw shared secret は D1 records と Browser payloads に含まれない

### Requirement: Server-side Agent RPC invocation

Client server は server-side generated clients からのみ Agent RPC を呼び出す SHALL。

**Customer Context**

Browser から Agent endpoint を直接呼ぶと CORS、credential distribution、authorization model が複雑になり、secret が露出する。Client は Server Components/Server Actions から generated Connect client を使って Agent API を呼ぶ必要がある。

**Requirement**

- Client server は Agent Service 呼び出しに generated Protobuf RPC client descriptors と server-side Connect transport を使用 MUST。
- Client server は `agent_id`、scopes、acting user context を含む Client Service authentication metadata を付与 MUST。
- Browser code は Agent RPC origin の直接呼び出しと raw Agent RPC requests の構築を MUST NOT。
- Client server は Hono routes または OpenAPI Agent artifacts から Agent RPC clients を生成して MUST NOT。

#### Scenario: Server Action calls Agent RPC with generated Connect client (CLIENT-REGISTRY-BE-S003)

- **GIVEN** user が Client UI で Agent management action を実行している
- **WHEN** 対応する Server Action が実行される
- **THEN** Server Action は Client D1 registry と credential reference を server-side で読み取る
- **AND** generated Connect client、binary Protobuf-compatible transport、authentication metadata を使って Agent Service を呼び出す
- **AND** Browser は sanitized action result data だけを受け取る

### Requirement: Agent domain snapshot non-persistence

Client server は Agent domain snapshots を Client-owned state として永続化しない SHALL。

**Customer Context**

Client UI は Agent profile、Thread、Run、Schedule、Tool、Extension 情報を表示する必要がある。しかし、それらの domain snapshots を Client D1 に複製すると stale projections と ownership ambiguity が生じる。Client は domain data が必要なときに Agent Service を問い合わせる必要がある。

**Requirement**

- Client D1 は Extension Installations、Adapter Connections、ToolInvocations、Schedules、AgentEvents、ThreadMemory、AgentState、AgentRun state の authoritative snapshots を永続化して MUST NOT。
- Client server は authoritative にならず secrets を含まない場合に限り ephemeral UI data を cache して MAY。
- Client server は screen/action の必要に応じて Agent domain state を Agent RPC から取得 MUST。

#### Scenario: Client reads Agent domain details from Agent RPC instead of D1 snapshots (CLIENT-REGISTRY-BE-S004)

- **GIVEN** Agent detail page が profile、Threads、Runs、Schedules、Tools、Extensions を必要としている
- **WHEN** Client server が page を render する、または refresh を処理する
- **THEN** Client server は Agent-owned domain data を Agent RPC から問い合わせる
- **AND** Client D1 は managed Agent registry と credential references に限定される

### Requirement: No Client public Agent proxy API

Client application は public Agent proxy APIs を公開しない SHALL。

**Customer Context**

Client は管理 UI であり Agent API provider ではない。Client が `/api` 経由で Agent API を代理公開すると、権限境界、監査、credential scope が曖昧になる。

**Requirement**

- Client は Agent Service operations を mirror する public REST、JSON、RPC proxy routes を公開 MUST NOT。
- Next.js Server Actions and Server Components は UI execution boundaries として動作 MAY だが、public Agent domain APIs として文書化または扱われて MUST NOT。
- Agent RPC origin and credentials は server-side に留める MUST。

#### Scenario: Client has no public Agent proxy route (CLIENT-REGISTRY-BE-S005)

- **GIVEN** Client Worker が management UI routes とともに deploy されている
- **WHEN** Browser または external caller が `/api/client/agents`、`/api/client/extensions`、または別の Agent proxy route へアクセスを試みる
- **THEN** Client は public Agent proxy endpoint を公開しない
- **AND** Agent operations は authenticated UI Server Actions または server-rendered flows 経由でのみ到達できる
