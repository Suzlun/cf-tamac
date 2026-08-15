---
name: openspec-proposer-workflow
description: Classify DIRECT, BEHAVIOR, or ARCHITECTURE planning work and author only the schema-specific OpenSpec artifacts. Use only as openspec/proposer.
compatibility: Requires openspec CLI.
---

# OpenSpec Proposer Workflow

This is the repository-specific contract layered on the generated
`openspec-propose` skill for `openspec/proposer`. Use the generated skill for
store selection, status, instructions, dependency traversal, and artifact path
resolution. This contract controls lane selection, explicit schema selection,
UX routing, intent resolution, and review convergence whenever the generic
workflow is broader or assumes the built-in schema.

## Inputs

- A request or confirmed proposal handoff.
- Optional `change-id`, planning store, and repository evidence.
- Optional explicit `lane` and `ux_mode`; verify rather than trust unsupported
  classifications.

## Independent classification

Classify both fields before creating anything:

```text
lane: DIRECT | BEHAVIOR | ARCHITECTURE
ux_mode: NONE | CONTINUITY | SHAPE
```

- `DIRECT` changes neither established observable behavior nor an externally
  owned contract and needs no material architecture decision. A local correction
  that restores existing specified behavior is `DIRECT`.
- `BEHAVIOR` changes observable behavior or an external contract without a
  material architecture decision.
- `ARCHITECTURE` requires a material decision about boundaries, security, data,
  dependencies, runtime, migration, rollback, or cross-domain structure.
- `NONE` has no visible surface work.
- `CONTINUITY` preserves identified current product precedent.
- `SHAPE` requires an intended experience direction not established by current
  precedent.

Treat solution-shaped wording as Desired Outcome, Outcome Constraint, Required
Means, or Candidate Means. A required means may require `ARCHITECTURE`, but it
never becomes a Requirement or Scenario.

Practice YAGNI throughout classification and artifact work. Do not create a Spec
Unit, Requirement, or Scenario unless its customer value is evident from the
request or confirmed interpretation. Standards, RFC compliance, packages, and
implementation techniques are means unless the customer explicitly needs their
externally observable effect. A visible UI composition or placement may be an
Outcome Constraint when it directly expresses the experience the customer wants,
rather than prescribing an internal component implementation.

## DIRECT

Create no directory, metadata, proposal, or placeholder Change. Return:

```text
NO_OPENSPEC_REQUIRED
lane: DIRECT
ux_mode: <value>
Evidence:
- <repository evidence>
Route: <responsible implementation agent>
```

If `ux_mode` would be `SHAPE`, the work is not `DIRECT`: shaping changes a
material visible direction and must be represented as observable behavior.

## Change schemas

- `BEHAVIOR` uses `behavior-change`: `proposal.md`, `specs/*/spec.md`,
  `tasks.md`.
- `ARCHITECTURE` uses `architecture-change`: `proposal.md`,
  `specs/*/spec.md`, `design.md`, `tasks.md`.

Create a new Change with:

```bash
pnpm exec openspec new change "<change-id>" --schema <schema> --json
```

Never create `design.md` for `BEHAVIOR`. Never create artifacts that the
selected schema does not define.

## Proposal ownership

`proposal.md` is the authoritative interpretation of the request. Inspect
repository evidence before writing it and keep `Intent-Resolution: DRAFT` while
any ambiguity could materially change behavior, external contracts,
architecture, security, data, dependencies, runtime, scope, or UX direction.

Use `REQUEST_SUFFICIENT` only when the request resolves every material
ambiguity. Use `OWNER_CONFIRMED` only after explicit confirmation of the
reconstructed interpretation.

## Reuse investigation

Before creating an `ARCHITECTURE` Change, investigate the implementation surface
in this order:

1. Existing repository code, shared boundaries, and established patterns.
2. Installed packages confirmed from manifests and the lockfile.
3. Established external packages relevant to needs not satisfied by the first
   two levels, including current primary documentation, maintenance evidence,
   compatibility, security, and supply-chain constraints.

Record relevant candidates or a reasoned `none` for every level. Select existing
code before installed packages, installed packages before adding an external
package, and an external package before independent implementation whenever the
earlier choice can satisfy the confirmed outcome within repository rules.
Independent implementation is permitted only when the evidence shows that none
of the reusable candidates can satisfy the confirmed outcome. Do not create the
Change until this investigation is sufficient to bound the material dependency
and reuse decisions.

## UX routing

- `NONE`: record why no visible surface changes and perform no UI delegation.
- `CONTINUITY`: inspect the current product and record exact continuity source
  paths in the proposal. Do not call `ux/shaper`.
- `SHAPE`: call `ux/shaper` before finalizing the proposal and before Specs.
  Provide the desired outcome, primary user task, current surface evidence,
  constraints, and open UX question. Integrate only its approved primary user
  task and UX direction into the proposal; do not create additional OpenSpec
  side artifacts.

Continue only after `ux/shaper` returns `DIRECTION_READY`. For
`OWNER_DECISION_REQUIRED`, obtain the owner's decision and rerun shaping. For
`BLOCKED`, stop with the missing product evidence.

## Artifact workflow

1. Read `AGENTS.md`, `openspec/config.yaml`, the selected schema, and relevant
   repository evidence.
2. Resolve the request interpretation in `proposal.md` using the schema template
   and instructions.
3. Author Specs from desired outcomes and outcome constraints with evident
   customer value only. Every Scenario has a stable ID; standards, packages,
   implementation techniques, and other means remain outside Specs. Preserve a
   confirmed visible UX composition when it is itself an Outcome Constraint.
4. For `ARCHITECTURE` only, identify each material decision and transfer the
   reuse investigation, selected reuse, and any justified independent
   implementation into `design.md`. Call
   `openspec/agent/architect` for Agent, TypeSpec, RPC, SDK, or Agent-owned data
   decisions and `openspec/client/architect` for Management Client or
   Client-owned data decisions in `DECISION_SUPPORT` only when repository
   evidence does not already determine the answer. Supply one exact question per
   call. Integrate the selected decisions into `design.md`.
5. Author `tasks.md` as a coarse work-package ledger. Each package names covered
   Requirements, Scenarios, or architecture decisions and objective completion
   evidence. Do not list files, private APIs, helpers, test layers, or detailed
   execution order.
6. Follow status and artifact instructions from the CLI after every artifact;
   preserve planning roots and store flags.

Architect output is accepted only when it includes `Recommendation`,
`Evidence`, `Alternatives`, `Trade-offs`, `Boundary`, `Revisit Trigger`, and
`Implementation Freedom`.

## Planning Ready

A Change is Planning Ready when behavior, external contracts, architecture,
security, data, dependencies, runtime, scope, and material UX direction are
resolved. Concrete files, private APIs, helpers, test layers, fixtures, and
within-package order remain implementation freedom.

## Convergence

Run:

```bash
pnpm exec openspec validate --type change "<change-id>" --strict --no-interactive
node scripts/openspec/verify-scenario-coverage.mjs --change "<change-id>"
pnpm lint:openspec
```

Then self-review with `openspec-review`. Use analyzer mode `SELF` for a normal
`BEHAVIOR` Change. Use `TARGETED` or `DEEP` only when evidence identifies a
specific need. Correct supported findings and repeat validation until the
analyzer returns `APPROVED` and `Planning Ready: YES`.

## Boundaries

- Proposer owns request interpretation, proposal, Specs, coarse tasks, and only
  architecture design.
- Architects do not author artifacts or behavior.
- Do not implement, edit generated outputs, add dependencies, deploy, access
  credentials, or perform external writes.
- Do not add compatibility aliases or preserve obsolete behavior.
