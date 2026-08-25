---
name: openspec-proposer-workflow
description: Classify DIRECT, BEHAVIOR, or ARCHITECTURE planning work and author only the schema-specific OpenSpec artifacts. Use only as openspec/proposer.
compatibility: Requires openspec CLI.
---

# OpenSpec Proposer Workflow

This is the repository-specific contract layered on the generated
`openspec-propose` skill for `openspec/proposer`. Use the generated skill for
store selection, status, instructions, dependency traversal, and artifact path
resolution. When the generic workflow is broader or assumes the built-in
schema, this contract controls lane selection, explicit schema selection, UX
routing, Request acceptance, and review convergence.

## Inputs

- A `change-id` whose Change already contains a primary-agent-owned
  `Request-Status: CONFIRMED` `request.md`.
- Optional planning store and repository evidence.
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

Treat solution-shaped wording in the confirmed Request as Desired Outcome,
Outcome Constraint, Required Means, or Candidate Means. A required means may
require `ARCHITECTURE`, but it never becomes a Requirement or Scenario.

Practice YAGNI throughout classification and artifact work. Create a Spec Unit,
Requirement, or Scenario only when it follows directly from `request.md`.
Repository evidence, common practice, security recommendations, implementation
necessity, downstream artifacts, and tests cannot create product behavior.
Standards, RFC compliance, packages, and implementation techniques are means
unless the confirmed Request explicitly requires their externally observable
effect. A visible UI composition or placement may be an Outcome Constraint only
when it is present in the confirmed Request.

## DIRECT

Edit no artifact and return the route mismatch to the primary agent:

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

- `BEHAVIOR` uses `behavior-change`: `request.md`, `proposal.md`,
  `specs/*/spec.md`, `tasks.md`.
- `ARCHITECTURE` uses `architecture-change`: `request.md`, `proposal.md`,
  `specs/*/spec.md`, `design.md`, `tasks.md`.

The primary agent has already created the Change and confirmed Request. Verify
the selected schema from `.openspec.yaml`; never create a Change or silently
switch its schema. Never create `design.md` for `BEHAVIOR`. Never create
artifacts that the selected schema does not define.

## Request acceptance

Before any artifact work, read `request.md`. Accept the Change only when it has
`Request-Status: CONFIRMED`, a concrete Request, and owner confirmation evidence.
If it is missing, unconfirmed, unclear, or internally inconsistent, return
`REQUEST_REQUIRED` to the primary agent without editing any artifact.

Never create, edit, supplement, reinterpret, or replace `request.md`. Keep
inferred improvements, candidate means, non-goals, rejected interpretations,
and design decisions out of the Request. If planning discovers that the Request
must change, stop and return the exact owner decision needed to the primary
agent.

## Reuse investigation

Before finalizing an `ARCHITECTURE` proposal or design, investigate the
implementation surface in this order:

1. Existing repository code, shared boundaries, and established patterns.
2. Installed packages confirmed from manifests and the lockfile.
3. Established external packages relevant to needs not satisfied by the first
   two levels, including current primary documentation, maintenance evidence,
   compatibility, security, and supply-chain constraints.

Record relevant candidates or a reasoned `none` for every level. Select existing
code before installed packages, installed packages before adding an external
package, and an external package before independent implementation whenever the
earlier choice can satisfy the confirmed Request within repository rules.
Independent implementation is permitted only when the evidence shows that none
of the reusable candidates can satisfy the confirmed Request. Do not finalize
the proposal or design until this investigation is sufficient to bound the
material dependency and reuse decisions.

## UX routing

- `NONE`: record why no visible surface changes and perform no UI delegation.
- `CONTINUITY`: inspect the current product and record exact continuity source
  paths in the proposal. Do not call `ux/shaper`.
- `SHAPE`: call `ux/shaper` before finalizing the proposal and before Specs.
  Provide the confirmed Request, current surface evidence, constraints, and open
  UX question. Integrate only a primary user task and UX direction directly
  supported by the Request; do not create additional OpenSpec side artifacts.

Continue only after `ux/shaper` returns `DIRECTION_READY`. For
`OWNER_DECISION_REQUIRED`, return to the primary agent so it can obtain owner
confirmation and update `request.md`, then rerun shaping. For `BLOCKED`, stop
with the missing product evidence.

## Artifact workflow

1. Read `AGENTS.md`, `openspec/config.yaml`, the selected schema, and relevant
   repository evidence.
2. Verify the primary-agent-owned confirmed Request, then derive `proposal.md`
   from it without adding outcomes, constraints, or required means.
3. Author Specs only from desired outcomes and outcome constraints in
   `request.md`. Every Scenario has a stable ID; standards, packages,
   implementation techniques, non-goals, rejected alternatives, absent legacy
   behavior, and other means remain outside Specs. Preserve a visible UX
   composition only when the confirmed Request makes it an Outcome Constraint.
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

Apply the planning-completion boundary from `docs/change-operation.md` and
`openspec-review`. Resolve only outcomes in the confirmed Request and material
decisions needed to realize them. Leave concrete representations and local
implementation choices to apply when they preserve the Request.

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

- Proposer owns proposal, Specs, coarse tasks, and architecture design only. It
  never owns or reinterprets `request.md`.
- Return `REQUEST_REQUIRED` without edits when the primary-agent-owned confirmed
  Request is absent or insufficient.
- Architects do not author artifacts or behavior.
- Do not implement, edit generated outputs, add dependencies, deploy, access
  credentials, or perform external writes.
- Do not add compatibility aliases or preserve obsolete behavior.
