---
description: Split a multi-part request by operation lane and dependencies, then route non-DIRECT work to the proposer primary agent.
agent: orchest
---

Input:

```text
$ARGUMENTS
```

Classify each work unit independently from repository evidence as
`lane: DIRECT | BEHAVIOR | ARCHITECTURE` and
`ux_mode: NONE | CONTINUITY | SHAPE`.

- `DIRECT`: create no Change; identify the implementation owner and verification boundary.
- `BEHAVIOR`: use `behavior-change`.
- `ARCHITECTURE`: use `architecture-change`.

Present each unit's caller-provided Background, Motivation, requested outcome,
classification, dependencies, and safe parallel groups. Keep missing or
ambiguous Request meaning explicit rather than interviewing the owner or
completing it. Do not create or edit an OpenSpec Change.

For every non-DIRECT unit, tell the user to select the `openspec/proposer`
primary agent and provide that unit as the next input. Proposer owns the
Background and Motivation interview, Request, and all planning artifacts. Do
not implement from this command.
