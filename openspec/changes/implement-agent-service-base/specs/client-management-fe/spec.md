## ADDED Requirements

### Requirement: Managed Agent list and registration UI

Client UI SHALL provide managed Agent listing and registration flows.

**Customer Context**

Agent 管理者は、登録済み Agent を一覧し、表示名、pin、並び順、最終閲覧を確認し、新しい Agent 接続を追加できる UI を必要としている。CLI や直接 RPC を知らなくても管理を開始できる必要がある。

**Requirement**

- Client UI MUST provide a managed Agent list screen showing display name, Agent ID, RPC origin, pinned status, sort order, last opened time, and connection/credential status.
- Client UI MUST provide an add/edit Agent registration form that validates Agent ID, RPC origin, display name, and credential reference input.
- Client UI MUST use Server Actions or Server Components for registry mutation and MUST NOT expose Agent credentials to client-side JavaScript.

#### Scenario: Agent list supports registry display and ordering (CLIENT-MANAGEMENT-FE-S001)

- **GIVEN** Client D1 contains multiple managed Agents with pin and sort metadata
- **WHEN** an operator opens the Agent list screen
- **THEN** pinned Agents and sort order are reflected in the list
- **AND** selecting an Agent updates last opened metadata through server-side action

#### Scenario: Add Agent form validates connection metadata accessibly (CLIENT-MANAGEMENT-FE-S002)

- **GIVEN** an operator opens the add Agent screen
- **WHEN** required fields are missing or RPC origin is invalid
- **THEN** the form displays accessible validation errors linked to the relevant inputs
- **AND** no registry record is created until validation passes server-side

### Requirement: Agent overview and configuration UI

Client UI SHALL render Agent overview and settings through server-side Agent RPC.

**Customer Context**

管理者は、Agent の profile、lifecycle、config、credential generation、capability summary を一画面で確認し、設定や credential rotation を安全に操作したい。

**Requirement**

- Client UI MUST provide an Agent overview screen that renders Agent profile, lifecycle status, config version, credential generation/status, and capability summary from Agent RPC.
- Client UI MUST provide settings actions for configuration update and credential rotation through server-side Agent RPC calls.
- Client UI MUST show Agent RPC errors with actionable messages without exposing secrets or raw internal stack traces.

#### Scenario: Agent overview renders server-side profile and config (CLIENT-MANAGEMENT-FE-S003)

- **GIVEN** an operator opens a registered Agent detail page
- **WHEN** Client server queries `GetAgent` and related config RPCs
- **THEN** the overview displays profile, lifecycle, config version, credential generation, and capability summary
- **AND** Browser payload does not include credential secret material

#### Scenario: Settings screen updates config and rotates credential through Agent RPC (CLIENT-MANAGEMENT-FE-S004)

- **GIVEN** an operator has permission to manage Agent settings
- **WHEN** the operator submits config update or credential rotation from the settings screen
- **THEN** Client server calls the corresponding Agent RPC with acting user context
- **AND** the UI reflects updated config version or credential generation after success

### Requirement: Thread Event Run and Compaction exploration UI

Client UI SHALL expose Thread, Event, Run, Compaction, and Memory exploration views.

**Customer Context**

Agent の自律判断を運用するには、Thread、Event、Run、Compaction、Handoff、History、Memory をたどって「何が起きたか」「なぜそう判断したか」を確認できる画面が必要である。

**Requirement**

- Client UI MUST provide Thread list/detail screens with Thread key, status, Section, latest Event, latest Run, and Memory/Compaction summary.
- Client UI MUST provide Event and Run views with sequence, type, source, status, snapshot, decision output, and causal links.
- Client UI MUST provide Compaction and Memory views exposing latest Handoff, History reference, Memory version, provenance, and rebase status.
- All data in these screens MUST be fetched from Agent RPC server-side and rendered without storing Agent domain snapshots in Client D1.

#### Scenario: Thread Event Run and Compaction tabs show Agent-owned history (CLIENT-MANAGEMENT-FE-S005)

- **GIVEN** an Agent has Threads with Events, Runs, Compactions, and Memory
- **WHEN** an operator navigates across Threads, Events, Runs, and Compactions tabs
- **THEN** each tab shows ordered Agent-owned records with sequence, status, causal links, and provenance
- **AND** pagination and filters preserve Agent/Thread scope

### Requirement: Schedule and Tool management UI

Client UI SHALL manage Schedules and Tool approvals through server-side actions.

**Customer Context**

管理者は Agent の将来動作と外部作用を監督する必要がある。Schedule の作成/取消、Tool catalog の確認、ToolInvocation の承認/拒否を UI から安全に行える必要がある。

**Requirement**

- Client UI MUST provide Schedule management screens for listing, creating, inspecting, and cancelling Agent-owned Schedules.
- Client UI MUST provide Tool catalog and ToolInvocation screens showing Tool definition, installation ownership, invocation status, approval status, attempts, and result Events.
- Client UI MUST require explicit user action for Tool approval/rejection and MUST call Agent RPC server-side with acting user context.

#### Scenario: Schedule tab creates and cancels schedules (CLIENT-MANAGEMENT-FE-S006)

- **GIVEN** an operator opens the Schedule tab for a registered Agent
- **WHEN** the operator creates a Schedule with Thread context and later cancels it
- **THEN** Client server calls `CreateSchedule` and `CancelSchedule`
- **AND** the UI shows schedule status, next fire time, overlap policy, and cancellation result from Agent RPC

#### Scenario: Tool approval screen requires explicit action (CLIENT-MANAGEMENT-FE-S007)

- **GIVEN** an Agent has a ToolInvocation in `pending_approval`
- **WHEN** an operator opens the Tool approval screen
- **THEN** approve and reject controls show Tool, input summary, risk/approval metadata, and acting user context
- **AND** approval or rejection is sent only after explicit user confirmation

### Requirement: Extension management UI

Client UI SHALL manage generic Extension installation and cleanup flows.

**Customer Context**

管理者は、Extension manifest を指定して Install し、Adapter Connection、Tool、Delivery、setup status を確認し、不要になった Extension を安全に Uninstall したい。

**Requirement**

- Client UI MUST provide Extension list/detail screens showing Installation status, manifest identity, Provider identity, grants, Adapter Connections, Tools, Delivery capabilities, and setup instructions.
- Client UI MUST provide install/uninstall actions through server-side Agent RPC.
- Client UI MUST make generic Extension information visible without assuming Discord-specific Provider implementation.

#### Scenario: Extension screen installs lists and uninstalls generic Extension (CLIENT-MANAGEMENT-FE-S008)

- **GIVEN** an operator has a signed generic Extension manifest
- **WHEN** the operator installs, inspects, and uninstalls the Extension from the Extension screen
- **THEN** Client server calls Agent Extension RPCs
- **AND** the UI shows Installation status, grants, Adapter Connections, Tools, Delivery capability, setup instructions, and cleanup result

### Requirement: Browser credential and direct RPC protection

Client UI SHALL keep Agent credentials and direct RPC calls out of Browser execution.

**Customer Context**

Client UI は Browser で動くため、Agent credential や signing material が一度でも Browser に渡ると漏えいリスクになる。すべての Agent RPC は server-side に閉じる必要がある。

**Requirement**

- Client UI MUST NOT embed Agent RPC credentials, private keys, raw tokens, or Provider secrets in HTML, JavaScript bundles, local storage, session storage, or network responses to Browser.
- Client UI MUST NOT call Agent RPC origin directly from Browser-side code.
- Error and loading states MUST be displayed without leaking secret metadata or raw internal error stacks.

#### Scenario: Browser does not receive Agent credentials or call Agent RPC directly (CLIENT-MANAGEMENT-FE-S009)

- **GIVEN** an operator navigates across Agent list, overview, Threads, Schedules, Tools, Extensions, and Settings screens
- **WHEN** Browser network responses, rendered HTML, JavaScript bundles, and storage are inspected
- **THEN** no Agent credential, private key, raw JWT signing material, Provider secret, or direct Agent RPC request is present
- **AND** Agent RPC calls originate only from Client server-side execution
