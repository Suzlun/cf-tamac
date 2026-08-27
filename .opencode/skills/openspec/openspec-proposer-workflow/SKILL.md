---
name: openspec-proposer-workflow
description: Governs owner dialogue, routing, Request updates, artifact authorship, and convergence for the user-selected openspec/proposer primary agent.
compatibility: Requires openspec CLI.
---

# OpenSpec Proposer Workflow

Use this repository-specific contract with the generated `openspec-propose`
skill. The generated skill owns store selection, status, instructions,
dependency traversal, and artifact path resolution. This contract owns the
repository's product and planning semantics.

## Primary ownership

The user selects `openspec/proposer` as the primary agent. This agent alone owns
route classification, owner interviews and questions, initial and incremental
`request.md` updates, all schema-defined planning artifacts, validation, and
semantic convergence. Do not delegate owner questions or artifact authorship.

## Route before creating

Classify `lane: DIRECT | BEHAVIOR | ARCHITECTURE`,
`ux_mode: NONE | CONTINUITY | SHAPE`, and
`review_depth: STANDARD | DEEP` independently.

- `DIRECT` changes neither established observable behavior nor material
  architecture. Create no Change and return `NO_OPENSPEC_REQUIRED`.
- `BEHAVIOR` changes observable behavior or an external contract without a
  material architecture decision. Explicitly use `behavior-change`.
- `ARCHITECTURE` requires a material Agent, Client, RPC, SDK, data, security,
  dependency, runtime, migration, rollback, or cross-package decision.
  Explicitly use `architecture-change`.

Never infer a lane from a named solution, and never omit `--schema`.

## Background and Motivation interview

Before requesting a concrete solution, ask one focused question at a time about
who is affected, the current situation, the Motivation for change, the expected
value, and the desired outcome. Motivation includes negative drivers such as
pain points or limitations and positive drivers such as opportunities,
aspirations, curiosity, or unexplored possibilities.

Trace solution-shaped input back to Background, Motivation, and desired outcome.
A named solution becomes a required means only when the owner explicitly makes
it binding.

Present one complete Request candidate containing only owner-confirmed
Background, Motivation, requested outcomes, outcome constraints, and required
means. Exclude inferred improvements, companion features, candidate means,
non-goals, rejected interpretations, repository evidence, and design decisions.
Create the Change and `request.md` only after explicit confirmation. Never create
a pending or draft Request file.

## Incremental confirmation

Treat a semantic statement as self-evident only when directly entailed by the
confirmed Request or deterministically established by an authoritative source.
For every other artifact-level semantic choice, stop and ask the owner one
focused question.

Route unambiguous answers to Background, Motivation, Request, Constraints, or
Required Means and record the answer immediately as confirmation evidence.
Factual clarifications remain evidence and non-binding choices remain design
candidates. After every Request update, re-read the complete Request and
reconcile all downstream artifacts.

Do not ask about files, private APIs, helpers, fixtures, policy-compliant test
organization, concrete representations within resolved meaning, or ready-package
implementation order.

## Artifact routing

- Background and Motivation explain the Request but never create Requirements.
- Specs contain only positive customer-valued observable outcomes and externally
  owned constraints directly entailed by the Request.
- Required means constrain design and tasks, not Requirements or Scenarios.
- `design.md` owns material architecture, security, data, dependency, runtime,
  migration, rollback, failure, risk, reuse, and revisit decisions.
- `tasks.md` remains a coarse Work Package ledger.

For `ARCHITECTURE` without observable behavior change, set `skip_specs: true`
and create no delta Specs, Requirements, Scenarios, Spec Units, Reuse Assessment
rows, or corresponding research reports.

## cf-tamac boundaries

Preserve the Agent Service, Management Client, SDK, Connect unary binary
Protobuf contract, Durable Object and D1 ownership, credential separation, and
generated RPC roots. Use `openspec/agent/architect` for Agent, TypeSpec, RPC,
SDK, or Agent-owned data decisions and `openspec/client/architect` for Client or
Client-owned data decisions, each for one unresolved material question only.

Use `ux/shaper` only for `UX Mode: SHAPE`. For each actual architecture delta
Spec Unit, investigate reusable repository code, workspace packages, direct
dependencies, repository-adopted packages, transitive-only packages,
established external packages, and updates. Delegate output is evidence or a
candidate decision, never Request authority.

## Schema traversal and convergence

Follow status, JSON artifact instructions, resolved paths, dependency edges, and
conditional skips from the generated skill. Re-read dependencies before each
artifact and apply the owner-question boundary before every non-self-evident
semantic statement.

Run strict Change validation, selected and all-active Scenario validation, and
`pnpm lint:openspec`. Invoke `openspec/analyzer` in `SELF` mode by default; use
`TARGETED` or `DEEP` only for evidenced risk. Return semantic decisions to the
owner and apply mechanical artifact corrections directly.

Finish when deterministic validation passes, semantic review returns
`APPROVED`, and `Planning Ready: YES` is justified. Stop before implementation
and tell the user to select the `openspec/applier` primary agent.
