## ADDED Requirements

### Requirement: Section boundary and compaction ownership

AIAgent Durable Object SHALL compact exactly one frozen Section per Compaction.

**Customer Context**

長期 Thread は Event が増え続けるため、単純な会話ログだけでは再開できない。Agent は Event range を Section として閉じ、要約ではなく Handoff、History、MemoryDelta を生成する compaction boundary を必要としている。

**Requirement**

- AIAgent Durable Object MUST treat one Compaction as the closure of exactly one Section.
- Starting compaction MUST freeze the current Section and immediately open the next Section for later Events.
- Compaction MUST be Agent-owned and Thread-scoped, and MUST NOT block new Event acceptance for the Thread.
- Compaction records MUST include event range, section ordinal, compaction ordinal, status, provenance, digest, and output references.

#### Scenario: Compaction freezes one Section and opens the next (AGENT-MEMORY-BE-S001)

- **GIVEN** Thread A has an open Section with Event sequence range `1..25`
- **WHEN** compaction starts for Thread A
- **THEN** Section `1` is frozen with range `1..25`
- **AND** Section `2` is opened before compaction output generation continues
- **AND** the Compaction record references exactly Section `1`

#### Scenario: Event arriving during compaction enters the open Section (AGENT-MEMORY-BE-S002)

- **GIVEN** Section `1` is frozen and compaction is running
- **WHEN** a new Event is accepted for the same Thread
- **THEN** the Event is appended to Section `2`
- **AND** it is not included in the frozen Section `1` compaction output
- **AND** the Event remains eligible for a later Run and later Compaction

### Requirement: Compaction outputs

Compaction SHALL produce Handoff, ThreadHistory, and ThreadMemoryDelta outputs.

**Customer Context**

Agent の再開には短い引き継ぎだけでなく、検証可能な詳細履歴と、出典付きの長期記憶が必要である。内部 chain-of-thought ではなく、外部から検証できる decision trace を保存する必要がある。

**Requirement**

- Each successful Compaction MUST produce a Handoff, ThreadHistory record, and ThreadMemoryDelta.
- Handoff MUST include situation, current goals, active intentions, decisions and rationale, open loops, pending questions, constraints, expected next actions, and important History references.
- ThreadHistory MUST include chronology, actor intentions, decisions, considered options, explicit rationale, assumptions, unresolved issues, Tool activity, artifacts, and replay manifest.
- ThreadMemoryDelta MUST support add, confirm, revise, supersede, and invalidate operations with provenance.

#### Scenario: Compaction creates Handoff History and MemoryDelta (AGENT-MEMORY-BE-S003)

- **GIVEN** a frozen Section contains user Events, Tool activity, decisions, and artifacts
- **WHEN** compaction succeeds
- **THEN** a Handoff suitable for prompt resumption is stored
- **AND** a detailed ThreadHistory index with digest/provenance is stored
- **AND** ThreadMemoryDelta operations are applied to create a new ThreadMemory version

#### Scenario: Context Builder resumes from latest ready compaction and raw Events (AGENT-MEMORY-BE-S004)

- **GIVEN** Thread A has a latest ready Compaction for Section `5` and raw Events in open Section `6`
- **WHEN** a new Run starts for Thread A
- **THEN** Context Builder uses Agent identity/policy, current ThreadMemory, latest ready Handoff, uncompacted Events, retrieved History, relevant Agent-level Memory, and trigger Event
- **AND** it does not depend on a running or failed Compaction output

### Requirement: Memory versioning and provenance

Memory records SHALL be versioned with provenance.

**Customer Context**

Agent が長期間活動すると、事実、方針、決定、制約が変化する。Memory は上書きだけでなく、いつ、どの Event/History に基づき、何を確認・修正・無効化したかを追跡できる必要がある。

**Requirement**

- ThreadMemory and AgentMemory MUST be versioned and MUST retain provenance to source Events, Compactions, History records, Run decisions, or operator actions.
- Memory updates MUST preserve supersede/invalidate relationships and MUST expose the active version used by each Run snapshot.
- Contradictory or stale Memory items MUST be resolved through explicit revise, supersede, or invalidate operations instead of silent overwrite.

#### Scenario: Memory update preserves provenance and version (AGENT-MEMORY-BE-S005)

- **GIVEN** Compaction output proposes a MemoryDelta that revises a prior constraint
- **WHEN** the MemoryDelta is applied
- **THEN** a new Memory version is created
- **AND** the revised item references the prior item and source Compaction/History/Event IDs
- **AND** future Run snapshots record the new Memory version

### Requirement: History and archive storage

AIAgent Durable Object SHALL offload large History and archive bodies while preserving indexes.

**Customer Context**

Durable Object SQLite にはサイズ制約があるため、大きな History、payload、artifact を永続化しながら active working set を守る必要がある。大容量 body は R2 に置いても、Agent は所有権、digest、参照、retention 状態を保持する必要がある。

**Requirement**

- Detailed History bodies, large Event payloads, transcripts, Tool result blobs, artifacts, and archived Event segments MUST be eligible for immutable R2 offload.
- AIAgent Durable Object MUST keep authoritative index metadata including object reference, digest, event range, ownership, provenance, size, and retention status.
- Storage thresholds MUST drive warning, compaction/archive priority, large body offload, and critical read/delete/compact/export behavior.
- Initial storage thresholds MUST use inline payload <= 64 KiB, 70% warning, 80% compaction/archive priority, 90% force large body R2, and 95% critical mode that prioritizes read/delete/compact/export.

#### Scenario: Large History body is stored in R2 with index metadata (AGENT-MEMORY-BE-S006)

- **GIVEN** a ThreadHistory body exceeds the 64 KiB inline storage threshold or storage usage is at the 90% large body offload threshold
- **WHEN** compaction writes the History output
- **THEN** the body is written to R2 as an immutable object
- **AND** DO SQLite stores history reference, digest, Section range, Compaction ID, provenance, size, and retention status

### Requirement: Compaction Memory and History queries

Agent Service は Compaction、ThreadMemory、ThreadHistory query を Agent-owned index に限定 MUST。

**Customer Context**

管理 UI、運用者、Context Builder は、最新の ready compaction、現在の ThreadMemory、検索された ThreadHistory を確認する必要がある。query が running/failed output や別 Agent の index を混ぜると、誤った文脈で Run が再開される。

**Requirement**

- `AgentThreadService.GetLatestCompaction` は対象 Thread の latest ready Compaction を返し、running、failed、cancelled output を ready として返す MUST NOT。
- `AgentThreadService.GetThreadMemory` は対象 Thread の active Memory version、items、provenance、supersede/invalidate lineage、snapshot reference metadata を返す MUST。
- `AgentThreadService.SearchThreadHistory` は Agent/Thread-scoped History index を検索し、query、time range、Section range、pagination、provenance filters を適用する MUST。
- これらの query は R2 body への raw access を直接公開せず、authorized path で digest と ownership metadata を検証できる reference を返す MUST。

#### Scenario: Thread memory and history queries return scoped references (AGENT-MEMORY-BE-S008)

- **GIVEN** Thread A has ready, running, and failed Compaction records with Memory and History indexes
- **WHEN** an authorized principal calls `GetLatestCompaction`, `GetThreadMemory`, and `SearchThreadHistory` for Thread A
- **THEN** responses include the latest ready Compaction, active Memory version with lineage, and scoped History search results
- **AND** running or failed Compaction output and other Agent history are not returned as usable context

### Requirement: Memory rebase for long-running Threads

Memory rebase SHALL refresh long-running Thread memory without losing lineage.

**Customer Context**

数百回の compaction を経た Thread は、summary-of-summary だけに依存すると重要な事実や判断理由が劣化する。Agent は History に戻る Memory rebase により長期記憶の品質を保つ必要がある。

**Requirement**

- AIAgent Durable Object MUST support Memory rebase that derives refreshed Memory from retained History, active Memory, and provenance.
- Rebase trigger policy MUST support thresholds such as compaction count, Memory item count, token estimate, contradiction count, and explicit rebase request.
- Rebase MUST preserve provenance and MUST NOT remove audit/history records required to explain previous decisions.

#### Scenario: Memory rebase refreshes long-term Memory without losing lineage (AGENT-MEMORY-BE-S007)

- **GIVEN** a Thread exceeds a configured compaction count or contradiction threshold
- **WHEN** Memory rebase runs
- **THEN** active Memory is refreshed using detailed History and provenance
- **AND** superseded, confirmed, revised, and invalidated lineage remains queryable
- **AND** future Run snapshots use the rebased Memory version
