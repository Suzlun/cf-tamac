---
name: openspec-review
description: Review schema-specific OpenSpec Changes for purpose and means separation, contradictions, excess requirements, misinterpretation, and material omissions.
compatibility: Requires openspec CLI.
---

# OpenSpec Change Review

This is the shared semantic contract for proposer self-review,
`openspec/reviewer`, and `openspec/analyzer`.

## Source precedence

1. `AGENTS.md` and enforced repository rules.
2. `openspec/config.yaml` and the selected schema.
3. Authoritative request interpretation in `proposal.md`.
4. Repository evidence relevant to the proposal.
5. Specs, architecture design when defined by the schema, and coarse tasks.

Require only artifacts defined by the selected schema. Deterministic validators
own structural checks.

## Purpose and means

- Desired outcomes and outcome constraints may become Requirements and
  Scenarios only when their customer value is evident from the request or
  confirmed interpretation.
- Technologies, components, dependencies, structures, algorithms, procedures,
  migrations, tools, files, commands, tests, and implementation sequences are
  means.
- Required means constrain architecture or tasks. Candidate means remain
  options. Neither becomes observable behavior merely because the owner named
  or mandated it.
- `proposal.md` records the classification and authoritative interpretation.
- `design.md` exists only for `architecture-change` and contains material
  decisions, not local implementation decomposition.
- `tasks.md` is a coarse work-package ledger, not a file or test-layer plan.
- Standards, RFC compliance, packages, and implementation techniques remain
  means unless the customer explicitly requires their externally observable
  effect. A visible UI composition or placement may be an Outcome Constraint
  when it directly expresses the requested experience; an internal component
  structure remains a means.
- An `architecture-change` design inventories relevant repository assets,
  installed packages, and established external packages, selects the earliest
  viable reuse level, and justifies independent implementation only when none of
  those candidates can satisfy the confirmed outcome within repository rules.

## Finding categories

- `CONTRADICTION`: applicable sources require materially incompatible outcomes
  or plans.
- `OVERREQUIREMENT`: an artifact requires behavior, structure, work, or an
  operational condition beyond its justified boundary.
- `MISINTERPRETATION`: the Change changes the meaning of the resolved proposal,
  promotes means into behavior, adds behavior without evident customer value, or
  presents assumptions as facts.
- `MATERIAL_OMISSION`: missing information leaves a pre-implementation decision
  that can materially change a confirmed customer-valued outcome, externally
  owned contract meaning, architecture, security, data, dependency, runtime,
  scope, or material UX direction.

Files, private APIs, helper decomposition, test layers, fixture layout, and
within-ready-package order are not material omissions when resolved boundaries
permit local choice. A choice is not a planning omission merely because the
contract source of truth or implementation must make it when the choice
preserves confirmed outcomes, externally owned contract meaning, and every
material boundary.

## Artifact routing

- Accept a candidate omission only after identifying the exact confirmed
  outcome, externally owned contract meaning, or material boundary it can change
  and the OpenSpec artifact or owner decision that must resolve it before
  implementation.
- Specs own customer-valued terminal outcomes and confirmed externally
  observable constraints. `design.md` owns only material architecture,
  security, data, dependency, and runtime decisions.
- The repository's contract source of truth, `tasks.md`, and progressive
  implementation own concrete representations, local construction,
  verification details, and choices within resolved boundaries. Reject
  completeness requests that cannot pass the material-omission test.

## UX review

- `NONE`: no visible work may be introduced.
- `CONTINUITY`: visible behavior must preserve the proposal's identified current
  product precedent.
- `SHAPE`: visible behavior must preserve the proposal's approved primary user
  task and UX direction.

Do not run a second shaping pass during semantic review. Report only a material
contradiction, excess, misinterpretation, or omission.

## Procedure

1. Read all schema-returned `contextFiles` and relevant repository evidence.
2. Separate outcomes, constraints, required means, and candidate means from the
   proposal.
3. Trace every Requirement and Scenario only to outcomes or constraints with
   evident customer value. Reject an RFC, standard, package, or implementation
   technique represented as behavior, while preserving confirmed visible UX
   composition that directly defines the requested experience.
4. For every candidate omission, identify the exact confirmed outcome or
   material boundary it can change and its required resolution owner. Reject
   contract-completeness and implementation-choice findings that do not pass
   this test.
5. For `architecture-change`, verify every material decision preserves Specs,
   includes a boundary and revisit trigger, and is supported by complete reuse
   evidence. Report missing candidate evaluation or selection as
   `MATERIAL_OMISSION`; report unjustified independent implementation as
   `OVERREQUIREMENT`.
6. Verify each work package has justified coverage and objective evidence while
   leaving local implementation choices open.
7. Group one root cause into one finding and try to disprove it before reporting.

## Results

- `APPROVED`: required validation passes and no actionable finding remains.
- `CHANGES_REQUIRED`: artifact edits can resolve all findings without a new
  material decision.
- `DECISION_REQUIRED`: a material decision in the omission boundary is needed.
- `FAILED`: required evidence cannot be read or evaluated.

`APPROVED` means Planning Ready under the lifecycle boundary in
`docs/change-operation.md`. Implementation may decide concrete representations,
files, private APIs, helpers, test layers, fixtures, and ready-package order when
those choices preserve the resolved meaning.

## Finding format

```text
Category: CONTRADICTION | OVERREQUIREMENT | MISINTERPRETATION | MATERIAL_OMISSION
Evidence:
- <path:line observed fact>
Proposal impact: <exact outcome or boundary affected>
Material consequence: <wrong, unsafe, or unverifiable result>
Required outcome: <artifact state needed>
Decision required: none | <exact material decision and owner>
```

Do not emit preference-only warnings or duplicate deterministic failures as
semantic findings.
