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
3. `openspec/proposer`-owned `Request-Status: CONFIRMED` in `request.md`.
4. Repository evidence relevant to the confirmed Request.
5. Proposal, Specs, architecture design when defined by the schema, and coarse
   tasks.

Require only artifacts defined by the selected schema. Deterministic validators
own structural checks.

`request.md` is owner-controlled evidence, not a downstream planning artifact.
Return `FAILED` when its confirmed Background, Motivation, Request, or
confirmation evidence is missing, unconfirmed, unreadable, or internally
inconsistent. Never create, edit, supplement, or reinterpret it during review.

## Purpose and means

- Desired outcomes and outcome constraints may become Requirements and
  Scenarios only when they follow directly from the confirmed Request.
- Confirmed Background and Motivation explain why the Request exists but never
  create a Requirement, Scenario, or outcome constraint by themselves.
- Technologies, components, dependencies, structures, algorithms, procedures,
  migrations, tools, files, commands, tests, and implementation sequences are
  means.
- Required means constrain architecture or tasks. Candidate means remain
  options. Neither becomes observable behavior merely because the owner named
  or mandated it.
- `proposal.md` is a fallible change proposal derived from the Request. It is
  not authoritative for what the owner requested.
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
- Every delta Spec Unit in an `architecture-change` has one or more reuse
  decisions, split by generic capability that repository code or a package can
  provide. Requirement traceability does not prove package-candidate coverage.
- Each reuse decision distinguishes repository code, workspace packages, direct
  dependencies, packages adopted elsewhere in the repository, transitive-only
  dependencies, new external packages, and updates. Transitive resolution alone
  is not direct adoption.
- Research evidence supports a reuse decision only when the report's stated
  investigation scope explicitly covers that generic capability. A narrow
  report cannot be generalized to an uninvestigated capability.
- Repository evidence, common practice, security recommendations,
  implementation necessity, downstream artifacts, and tests may constrain
  design but never create product behavior.
- Request, proposal, and Specs state positive requested outcomes. They do not
  preserve non-goals, rejected alternatives, absent legacy behavior, absent
  implementation, or technologies and features that will not be added.
- A confirmed authorization or confidentiality outcome is expressed as a
  positive guarantee, such as the actors allowed to change state or the fields
  allowed in a response. A rejection Scenario may demonstrate that guarantee.

## Finding categories

- `CONTRADICTION`: applicable sources require materially incompatible outcomes
  or plans.
- `OVERREQUIREMENT`: an artifact requires behavior, structure, work, or an
  operational condition not directly justified by the confirmed Request or an
  applicable repository constraint at that artifact layer.
- `MISINTERPRETATION`: the Change changes the meaning of the confirmed Request,
  promotes means into behavior, adds behavior absent from the Request, or
  presents assumptions as facts.
- `MATERIAL_OMISSION`: missing information leaves a pre-implementation decision
  that can materially change a confirmed customer-valued outcome, externally
  owned contract meaning, architecture, security, data, dependency, runtime,
  scope, or material UX direction.

Files, private APIs, helper decomposition, test layers, fixture layout, and
within-ready-package order are not material omissions when resolved boundaries
permit local choice. A choice is not a planning omission merely because the
contract source of truth or implementation must make it when the choice
preserves the confirmed Request, externally owned contract meaning, and every
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
- An obsolete Requirement is removed through `REMOVED Requirements`. Do not
  replace removed or unrequested behavior with an inverse Requirement that
  requires its absence.

## UX review

- `NONE`: no visible work may be introduced.
- `CONTINUITY`: visible behavior must preserve the proposal's identified current
  product precedent.
- `SHAPE`: visible behavior must preserve the proposal's approved primary user
  task and UX direction.

Do not run a second shaping pass during semantic review. Report only a material
contradiction, excess, misinterpretation, or omission.

## Procedure

1. Read the confirmed Request, all schema-returned `contextFiles`, and relevant
   repository evidence.
2. Separate outcomes, constraints, and required means stated in the Request
   from candidate means introduced downstream.
3. Trace every proposal outcome, Requirement, and Scenario directly to the
   confirmed Request. Reject behavior justified only by usefulness, common
   practice, security recommendation, repository evidence, implementation
   necessity, downstream artifacts, or tests. Reject an RFC, standard, package,
   implementation technique, non-goal, rejected alternative, or absent
   implementation represented as behavior.
4. For every candidate omission, identify the exact confirmed Request outcome or
   material boundary it can change and its required resolution owner. Reject
   contract-completeness and implementation-choice findings that do not pass
   this test.
5. For `architecture-change`, derive the delta Spec Unit set from the actual
   `specs/**/spec.md` paths. Verify every Spec Unit is represented in `Reuse
Assessment`, its generic capabilities are not collapsed into one
   customer-specific Requirement, and each decision has a valid source
   classification, selected target and version, and current scoped research
   evidence. Report a missing capability, out-of-scope research citation,
   unexamined package state, or missing candidate selection as
   `MATERIAL_OMISSION`; report unjustified `LIMITED_COMPLEMENT` as
   `OVERREQUIREMENT`.
6. Verify each work package has justified coverage and objective evidence while
   leaving local implementation choices open.
7. Verify every work package causes an outcome required by the Request rather
   than merely satisfying downstream wording.
8. Group one root cause into one finding and try to disprove it before reporting.

## Results

- `APPROVED`: required validation passes and no actionable finding remains.
- `CHANGES_REQUIRED`: artifact edits can resolve all findings without a new
  material decision.
- `DECISION_REQUIRED`: a material decision in the omission boundary is needed.
- `FAILED`: required evidence cannot be read or evaluated.

`APPROVED` means Planning Ready under the lifecycle boundary in
`docs/change-operation.md`. Implementation may decide concrete representations,
files, private APIs, helpers, test layers, fixtures, and ready-package order when
those choices preserve the confirmed Request.

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
