## ADDED Requirements

### Requirement: Client-owned 管理対象 Agent 台帳の所有

Client server は Client D1 内の管理対象 Agent 台帳メタデータを所有 SHALL。

**利用者文脈**

管理 UI は複数の Agent を扱うが、Agent Service は Agent 横断一覧を提供しない。Client は自分が管理対象として登録した Agent ID、RPC origin、表示設定だけを Client 専用 D1 に持ち、Agent domain 正本を複製しない必要がある。

**要件**

- Client server は管理対象 Agent の Client D1 台帳を所有 MUST。台帳は `agent_id`、Agent RPC origin、表示名、pin フラグ、並び順、作成/更新時刻、最終閲覧時刻を保持する。
- Client server は Client-owned サーバー側コードだけを通じて台帳を読み書き MUST。
- Agent Service は Client D1 を読み書き MUST NOT。
- Client 台帳は authoritative Agent domain 状態として扱われて MUST NOT。

#### Scenario: 管理対象 Agent 台帳が表示と並び順のメタデータを永続化する (CLIENT-REGISTRY-BE-S001)

- **GIVEN** Client 運用者が Agent RPC origin と表示名を指定して `agent-alpha` を登録している
- **WHEN** 運用者が Agent entry を pin、並べ替え、rename、または open する
- **THEN** Client D1 は表示名、pin フラグ、並び順、時刻、最終閲覧時刻を永続化する
- **AND** 台帳だけの更新では Agent Service 状態は変更されない

### Requirement: credential 参照境界の維持

Client server は平文 secret を含めずに credential 参照を保存 SHALL。

**利用者文脈**

Client は Agent RPC をサーバー側で呼ぶため credential 参照を管理する必要があるが、秘密鍵や生 secret を D1 や Browser に平文で渡すと漏えいにつながる。

**要件**

- Client D1 は Agent credential 参照、key ID、マスク済みヒント、状態、時刻を保存 MUST。平文の秘密鍵または生 shared secret は保存しない。
- Client server はサーバー側実行内でのみ credential 参照を解決 MUST。
- Browser 応答は Agent credential、生 JWT 署名鍵、Provider 秘密鍵、生 shared secret を含んで MUST NOT。

#### Scenario: credential 参照は平文 secret を保存しない (CLIENT-REGISTRY-BE-S002)

- **GIVEN** 運用者が `agent-alpha` の Client 側 credential 参照を保存または rotate している
- **WHEN** Client server が credential メタデータを永続化する
- **THEN** D1 には credential 参照、key ID、マスク済みヒント、状態、時刻だけが含まれる
- **AND** 平文の秘密鍵または生 shared secret は D1 記録と Browser payload に含まれない

### Requirement: サーバー側 Agent RPC invocation の限定

Client server はサーバー側の生成済み client からのみ Agent RPC を呼び出す SHALL。

**利用者文脈**

Browser から Agent エンドポイントを直接呼ぶと CORS、credential 配布、認可モデルが複雑になり、secret が露出する。Client は Server Components/Server Actions から生成済み Connect client を使って Agent API を呼ぶ必要がある。

**要件**

- Client server は Agent Service 呼び出しに生成済み Protobuf RPC client descriptor とサーバー側 Connect transport を使用 MUST。
- Client server は `agent_id`、scope、acting user 文脈を含む Client Service 認証メタデータを付与 MUST。
- Browser コードは Agent RPC origin を直接呼び出して MUST NOT し、生 Agent RPC リクエストを構築して MUST NOT。
- Client server は Hono route または OpenAPI Agent 成果物から Agent RPC client を生成して MUST NOT。

#### Scenario: Server Action が生成済み Connect client で Agent RPC を呼ぶ (CLIENT-REGISTRY-BE-S003)

- **GIVEN** user が Client UI で Agent 管理 action を実行している
- **WHEN** 対応する Server Action が実行される
- **THEN** Server Action は Client D1 台帳と credential 参照をサーバー側で読み取る
- **AND** 生成済み Connect client、binary Protobuf 互換 transport、認証メタデータを使って Agent Service を呼び出す
- **AND** Browser は安全化済み action 結果データだけを受け取る

### Requirement: Agent domain スナップショット非永続化の保証

Client server は Agent domain スナップショットを Client-owned 状態として永続化しない SHALL。

**利用者文脈**

Client UI は Agent profile、Thread、Run、Schedule、Tool、Extension 情報を表示する必要がある。しかし、それらの domain スナップショットを Client D1 に複製すると古い projection と所有関係の曖昧さが生じる。Client は domain データが必要なときに Agent Service を問い合わせる必要がある。

**要件**

- Client D1 は Extension Installation、Adapter Connection、ToolInvocation、Schedule、AgentEvent、ThreadMemory、AgentState、AgentRun 状態の authoritative スナップショットを永続化して MUST NOT。
- Client server は authoritative にならず secret を含まない場合に限り、一時的な UI データを cache できる。
- Client server は画面/action の必要に応じて Agent domain 状態を Agent RPC から取得 MUST。

#### Scenario: Client が D1 スナップショットではなく Agent RPC から Agent domain 詳細を読む (CLIENT-REGISTRY-BE-S004)

- **GIVEN** Agent 詳細ページが profile、Thread、Run、Schedule、Tool、Extension を必要としている
- **WHEN** Client server がページを描画する、または refresh を処理する
- **THEN** Client server は Agent-owned domain データを Agent RPC から問い合わせる
- **AND** Client D1 は管理対象 Agent 台帳と credential 参照に限定される

### Requirement: Client 公開 Agent proxy API を持たない

Client application は公開 Agent proxy API を公開しない SHALL。

**利用者文脈**

Client は管理 UI であり Agent API Provider ではない。Client が `/api` 経由で Agent API を代理公開すると、権限境界、監査、credential scope が曖昧になる。

**要件**

- Client は Agent Service operation を mirror する公開 REST、JSON、RPC proxy route を公開して MUST NOT。
- Next.js Server Actions と Server Components は UI 実行境界として動作できるが、公開 Agent domain API として文書化または扱われて MUST NOT。
- Agent RPC origin と credential はサーバー側に留める MUST。

#### Scenario: Client が公開 Agent proxy route を持たない (CLIENT-REGISTRY-BE-S005)

- **GIVEN** Client Worker が管理 UI route とともに deploy されている
- **WHEN** Browser または外部 caller が `/api/client/agents`、`/api/client/extensions`、または別の Agent proxy route へアクセスを試みる
- **THEN** Client は公開 Agent proxy エンドポイントを公開しない
- **AND** Agent operation は認証済み UI Server Action または server-rendered flow 経由でのみ到達できる
