---
description: Implement tasks from an OpenSpec change (Experimental)
agent: openspec/applier
---

Implement tasks from an OpenSpec change.

Load `openspec-apply-change` and follow it as the execution contract. Do not load or perform a semantic review workflow.

When UI is in scope, treat `.wireframe.json` as the visible-surface source and the matching `.wireframe.html` and screenshot as `openspec/designer` rendering evidence. Never edit or recapture the evidence during apply. Resolve only self-evident implementation details that preserve existing actions, information structure, and copy. Return `BLOCKED` instead of redesigning the surface when artifacts conflict or a non-self-evident visible change is necessary.

**Input**: Optionally specify a change name (e.g., `/opsx-apply add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `pnpm exec openspec list --json` to get available changes and use the **AskUserQuestion tool** to let the user select

   Always announce: "Using change: <name>" and how to override (e.g., `/opsx-apply <other>`).

2. **Check status to understand the schema**

   ```bash
   pnpm exec openspec status --change "<name>" --json
   ```

   Parse the JSON to understand:
   - `schemaName`: The workflow being used (e.g., "spec-driven")
   - `planningHome`, `changeRoot`, and `actionContext`: planning scope and edit constraints
   - Which artifact contains the tasks (typically "tasks" for spec-driven, check status for others)

3. **Get apply instructions**

   ```bash
   pnpm exec openspec instructions apply --change "<name>" --json
   ```

   This returns:
   - `contextFiles`: artifact ID -> array of concrete file paths (varies by schema)
   - Progress (total, complete, remaining)
   - Task list with status
   - Dynamic instruction based on current state

   **Handle states:**
   - If `state: "blocked"` (missing artifacts): return `BLOCKED` with the missing-artifact evidence and stop without delegating artifact creation or repair
   - If `state: "all_done"`: skip implementation delegation and proceed to facilitator review
   - Otherwise: proceed to implementation

   **Workspace guard:** If status JSON reports `actionContext.mode: "workspace-planning"` and `allowedEditRoots` is empty, explain that full workspace apply is not supported in this slice. Treat linked repos and folders as read-only context, ask the user to select an affected area through an explicit implementation workflow, and STOP before editing files.

4. **Read context files**

   Read every file path listed under `contextFiles` from the apply instructions output.
   The files depend on the schema being used:
   - **new-feature**: intent, proposal, specs, design, tasks
   - **spec-driven**: proposal, specs, design, tasks
   - Other schemas: follow the contextFiles from CLI output

   If a required artifact is missing or a `contextFiles` path is unreadable, return `BLOCKED` with exact path evidence. Do not delegate planning-artifact creation or repair.

5. **Show current progress**

   Display:
   - Schema being used
   - Progress: "N/M tasks complete"
   - Remaining tasks overview
   - Dynamic instruction from CLI
   - A complete `## Agent Delegation Timeline` covering every current task, owner, dependency, conflict boundary, and planned verification before the first implementation delegation; reissue it whenever the plan changes and restore it after compaction if absent

6. **Delegate tasks (loop until done or blocked)**

   At each iteration:
   - Determine task ownership and split work only when needed for safe execution
   - Compute dependencies, file or generated-artifact conflicts, and the dependency-safe parallel ready set
   - Delegate Management Client work to `unit/client/engineer`, Agent Service and Agent-owned contract/codegen work to `unit/agent/engineer`, and `tamac-sdk` or other cross-package work to `unit/build/builder`
   - Launch independent ready work in parallel and record why any ready work must be serialized
   - Mark a task complete only after implementation and verification evidence are accepted: `- [ ]` → `- [x]`
   - Re-run apply instructions after each accepted batch and continue until `all_done`

   **Pause if:**
   - A dependency or version addition, permission-boundary change, destructive operation, or external operation is required → stop the affected work and report evidence
   - A required artifact is missing or unreadable → stop without delegating artifact repair
   - Implementation reveals a material unresolved product, contract, architecture, security, data, dependency, or visible-surface decision → return evidence to Proposer for the affected work
   - Error or blocker encountered → report evidence
   - User interrupts

   Continue independent tasks that cannot be affected by a stopped task or unresolved decision. Do not report the Change complete while blocked work remains.

7. **Run final review and show status**

   When the CLI reports `all_done`, request final review from `unit/review/facilitator`. Route valid in-scope findings to the responsible implementer, rerun affected verification, and rerun the complete facilitator review until it returns `APPROVE`. Report archive-ready only after approval.

   Display:
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: suggest archive
   - If paused: explain why and wait for guidance

**Output During Implementation**

```
## Implementing: <change-name> (schema: <schema-name>)

Working on task 3/7: <task description>
[...implementation happening...]
✓ Task complete

Working on task 4/7: <task description>
[...implementation happening...]
✓ Task complete
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 7/7 tasks complete ✓

### Completed This Session
- [x] Task 1
- [x] Task 2
...

Facilitator review approved. This change is archive-ready and can be archived with `/opsx-archive`.
```

**Output On Pause (Issue Encountered)**

```
## Implementation Paused

**Change:** <change-name>
**Schema:** <schema-name>
**Progress:** 4/7 tasks complete

### Issue Encountered
<description of the issue>

**Options:**
1. <option 1>
2. <option 2>
3. Other approach

What would you like to do?
```

**Guardrails**

- Keep going through tasks until done or blocked
- Always read context files before starting (from the apply instructions output)
- Do not load a semantic review workflow
- Compute task ownership, splitting, dependencies, conflicts, and parallel groups at execution time
- Continue unaffected independent tasks when one task is stopped
- Update task checkbox immediately after completing each task
- Stop affected work on safety boundaries or material unresolved decisions; do not guess
- Use contextFiles from CLI output, don't assume specific file names

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: Before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions
- **Allows artifact updates**: If implementation reveals design issues, suggest updating artifacts - not phase-locked, work fluidly
