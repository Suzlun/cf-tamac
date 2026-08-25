---
description: Split a multi-part request by operation lane and dependencies, creating OpenSpec proposals only for non-DIRECT work.
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

Present each unit's Request candidate, classification, dependencies, and safe
parallel groups for explicit owner confirmation. Each candidate contains only
the requested outcome, explicitly stated outcome constraints, and explicitly
required means. Do not persist non-goals, rejected interpretations, candidate
means, or inferred improvements.

After the owner confirms a Change unit, create that Change with the CLI and
write only its `Request-Status: CONFIRMED` `request.md`. Then delegate the Change
to `openspec/proposer`. The proposer must not receive, create, or repair an
unconfirmed Request. Independent confirmed proposals may run in parallel. Do
not implement from this command. Report evidence that each proposal passes
strict validation and Scenario coverage and returns `Planning Ready: YES`.
