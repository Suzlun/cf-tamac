## ADDED Requirements

### Requirement: Section 境界と Compaction 所有関係

AIAgent Durable Object は Compaction ごとに正確に一つの frozen Section を compact SHALL。

**利用者文脈**

長期 Thread は Event が増え続けるため、単純な会話ログだけでは再開できない。Agent は Event 範囲を Section として閉じ、要約ではなく Handoff、History、MemoryDelta を生成する Compaction 境界を必要としている。

**要件**

- AIAgent Durable Object は、一つの Compaction を正確に一つの Section の closure として扱う MUST。
- Compaction 開始は現在 Section を固定 MUST し、後続 Event 用の次 Section を直ちに open MUST。
- Compaction は Agent-owned かつ Thread-scoped である MUST し、その Thread の新しい Event 受理を block して MUST NOT。
- Compaction 記録は Event 範囲、Section ordinal、Compaction ordinal、`status`、provenance、digest、出力参照を含める MUST。

#### Scenario: Compaction が一つの Section を freeze し次を open する (AGENT-MEMORY-S001)

- **GIVEN** Thread A が Event sequence range `1..25` を持つ open Section を有している
- **WHEN** Thread A の compaction が開始する
- **THEN** Section `1` は range `1..25` で frozen になる
- **AND** Compaction 出力生成が続く前に Section `2` が open される
- **AND** Compaction record は正確に Section `1` を参照する

#### Scenario: Compaction 中に到着した Event は open Section に入る (AGENT-MEMORY-S002)

- **GIVEN** Section `1` が frozen で、Compaction が running である
- **WHEN** 同じ Thread の新しい Event が受理される
- **THEN** Event は Section `2` に追加される
- **AND** frozen Section `1` の Compaction 出力には含まれない
- **AND** Event は後続 Run と後続 Compaction の対象のままである

### Requirement: Compaction 出力の生成

Compaction は Handoff、ThreadHistory、ThreadMemoryDelta 出力を生成 SHALL。

**利用者文脈**

Agent の再開には短い引き継ぎだけでなく、検証可能な詳細履歴と、出典付きの長期記憶が必要である。内部 chain-of-thought ではなく、外部から検証できる判断 trace を保存する必要がある。

**要件**

- 成功した各 Compaction は Handoff、ThreadHistory 記録、ThreadMemoryDelta を生成 MUST。
- Handoff は状況、現在の目標、有効な意図、判断と理由、open loop、未解決質問、制約、想定次 action、重要な History 参照を含める MUST。
- ThreadHistory は時系列、実行者の意図、判断、検討選択肢、明示的理由、前提、未解決問題、Tool 活動、成果物、replay manifest を含める MUST。
- ThreadMemoryDelta は provenance 付きの add、confirm、revise、supersede、invalidate operation を支援 MUST。

#### Scenario: Compaction が Handoff History と MemoryDelta を作成する (AGENT-MEMORY-S003)

- **GIVEN** frozen Section に user Events、Tool activity、decisions、artifacts が含まれている
- **WHEN** compaction が成功する
- **THEN** prompt 再開に適した Handoff が保存される
- **AND** digest/provenance を持つ詳細 ThreadHistory index が保存される
- **AND** 新しい ThreadMemory 版を作成するため ThreadMemoryDelta operation が適用される

#### Scenario: Context Builder が latest ready compaction と raw Events から再開する (AGENT-MEMORY-S004)

- **GIVEN** Thread A が Section `5` の latest ready Compaction と open Section `6` の raw Event を持っている
- **WHEN** Thread A の新しい Run が開始する
- **THEN** Context Builder は Agent identity/policy、現在 ThreadMemory、latest ready Handoff、未 Compaction Event、取得済み History、関連 Agent-level Memory、trigger Event を使用する
- **AND** running または failed の Compaction 出力に依存しない

### Requirement: Memory 版管理と provenance

Memory 記録は provenance 付きで版管理 SHALL。

**利用者文脈**

Agent が長期間活動すると、事実、方針、判断、制約が変化する。Memory は上書きだけでなく、いつ、どの Event/History に基づき、何を確認・修正・無効化したかを追跡できる必要がある。

**要件**

- ThreadMemory と AgentMemory は版管理される MUST し、source Event、Compaction、History 記録、Run 判断、または運用者 action への provenance を保持 MUST。
- Memory 更新は supersede/invalidate 関係を保持 MUST し、各 Run スナップショットが使用した有効版を公開 MUST。
- 矛盾または stale な Memory item は silent overwrite ではなく、明示的な revise、supersede、invalidate operation により解決 MUST。

#### Scenario: Memory update が provenance と版を保持する (AGENT-MEMORY-S005)

- **GIVEN** Compaction 出力が以前の制約を revise する MemoryDelta を提案している
- **WHEN** MemoryDelta が適用される
- **THEN** 新しい Memory 版が作成される
- **AND** revised item は以前の item と source Compaction/History/Event ID を参照する
- **AND** future Run スナップショットは新しい Memory 版を記録する

### Requirement: History と archive storage

AIAgent Durable Object は index を保持しながら大きな History と archive body を offload SHALL。

**利用者文脈**

Durable Object SQLite にはサイズ制約があるため、大きな History、payload、artifact を永続化しながら有効 working set を守る必要がある。大容量 body は R2 に置いても、Agent は所有関係、digest、参照、retention 状態を保持する必要がある。

**要件**

- 詳細 History body、大きな Event payload、transcript、Tool 結果 blob、artifact、archive 済み Event segment は immutable R2 offload の対象になれる MUST。
- AIAgent Durable Object は object 参照、digest、Event 範囲、所有関係、provenance、サイズ、retention 状態を含む authoritative index メタデータを保持 MUST。
- Storage 閾値は warning、Compaction/archive priority、large body offload、critical read/delete/compact/export 振る舞いを駆動 MUST。
- 初期 storage 閾値は inline payload <= 64 KiB、70% warning、80% compaction/archive priority、90% force large body R2、read/delete/compact/export を優先する 95% critical mode を使用 MUST。

#### Scenario: 大きな History body が index メタデータ付きで R2 に保存される (AGENT-MEMORY-S006)

- **GIVEN** ThreadHistory body が 64 KiB inline storage threshold を超える、または storage usage が 90% large body offload threshold に到達している
- **WHEN** compaction が History output を書き込む
- **THEN** body は immutable object として R2 に書き込まれる
- **AND** DO SQLite は history reference、digest、Section range、Compaction ID、provenance、size、retention 状態を保存する

### Requirement: Compaction Memory と History 照会

Agent Service は Compaction、ThreadMemory、ThreadHistory 照会を Agent-owned index に限定 MUST。

**利用者文脈**

管理 UI、運用者、Context Builder は、最新の ready Compaction、現在の ThreadMemory、検索された ThreadHistory を確認する必要がある。照会が running/failed 出力や別 Agent の index を混ぜると、誤った文脈で Run が再開される。

**要件**

- `AgentThreadService.GetLatestCompaction` は対象 Thread の latest ready Compaction を返し、running、failed、cancelled 出力を ready として返す MUST NOT。
- `AgentThreadService.GetThreadMemory` は対象 Thread の有効 Memory 版、item、provenance、supersede/invalidate lineage、スナップショット参照メタデータを返す MUST。
- `AgentThreadService.SearchThreadHistory` は Agent/Thread-scoped History index を検索し、照会、時間範囲、Section 範囲、ページング、provenance 絞り込み条件を適用する MUST。
- これらの照会は R2 body への raw access を直接公開せず、認可済み経路で digest と所有関係メタデータを検証できる参照を返す MUST。

#### Scenario: Thread memory と history 照会が scoped 参照を返す (AGENT-MEMORY-S008)

- **GIVEN** Thread A が Memory と History index を持つ ready、running、failed の Compaction 記録を有している
- **WHEN** 認可済み principal が Thread A に対して `GetLatestCompaction`、`GetThreadMemory`、`SearchThreadHistory` を呼ぶ
- **THEN** 応答には latest ready Compaction、lineage 付き有効 Memory 版、scoped History 検索結果が含まれる
- **AND** running または failed の Compaction 出力と他 Agent history は利用可能文脈として返されない

### Requirement: long-running Thread の Memory rebase

Memory rebase は lineage を失わずに long-running Thread memory を refresh SHALL。

**利用者文脈**

数百回の Compaction を経た Thread は、summary-of-summary だけに依存すると重要な事実や判断理由が劣化する。Agent は History に戻る Memory rebase により長期記憶の品質を保つ必要がある。

**要件**

- AIAgent Durable Object は保持済み History、有効 Memory、provenance から refreshed Memory を導出する Memory rebase を支援 MUST。
- Rebase trigger policy は Compaction 数、Memory item 数、token 見積もり、矛盾数、明示 rebase リクエストなどの閾値を支援 MUST。
- Rebase は provenance を保持 MUST し、以前の判断を説明するために必要な監査/History 記録を削除して MUST NOT。

#### Scenario: Memory rebase が lineage を失わず long-term Memory を refresh する (AGENT-MEMORY-S007)

- **GIVEN** Thread が configured compaction count または contradiction threshold を超えている
- **WHEN** Memory rebase が実行される
- **THEN** 有効 Memory は詳細 History と provenance を使って refresh される
- **AND** superseded、confirmed、revised、invalidated lineage は照会可能なままである
- **AND** future Run スナップショットは rebased Memory 版を使用する
