---
name: change-routing
description: Classify a request as DIRECT, BEHAVIOR, or ARCHITECTURE with an independent UX mode and affected domains. Use before implementation or OpenSpec planning begins.
---

# Change Routing

Classify work from customer outcome and repository evidence, not from the
solution named in the request.

## Required Input

- Customer outcome
- Scope and non-goals
- Required and candidate means
- Relevant files, existing Specs, current surfaces, and external contracts
- Unresolved material decisions

If an unresolved ambiguity can change the classification, request one focused
decision and do not emit speculative YAML.

## Operation Lane

- `DIRECT`: changes neither established observable behavior nor an external
  contract and requires no material architecture decision. Create no OpenSpec
  Change. A local fix that restores existing specified behavior is `DIRECT`.
- `BEHAVIOR`: changes an outcome observable by a user, caller, or external
  contract without requiring a material architecture decision. Use
  `behavior-change`.
- `ARCHITECTURE`: requires a material decision about responsibility boundaries,
  dependency direction, data ownership, security boundaries, dependencies,
  runtime, migration, rollback, or cross-domain structure. Use
  `architecture-change`.

Do not select `ARCHITECTURE` from words such as "migration", "refactor", or
"architecture" alone. Select it only when a material decision must persist.

## UX Mode

- `NONE`: no visible surface, copy, interaction, state, or responsive behavior
  changes.
- `CONTINUITY`: visible implementation changes while an identified current
  experience, primary task, and composition remain authoritative.
- `SHAPE`: a new surface or a material change to the primary task, flow,
  information hierarchy, visible copy, states, or recovery requires UX shaping.

Touching a UI file does not imply `SHAPE`. Agent, SDK, and contract work is not
`NONE` when it changes a visible Management Client state or action result. Lane
and UX mode remain independent; a behavior or architecture Change can use any
UX mode.

## Affected Domains

List only domains that require implementation or domain-specific review, in
this order:

1. `client`: `packages/client/**` and browser-visible Management Client behavior
2. `agent`: `packages/agent/**`, Agent TypeSpec, Protobuf RPC, Durable Object
   runtime, and Agent-owned storage
3. `sdk`: `packages/sdk/**` and the server-side Agent RPC consumer contract
4. `build`: repository configuration, generation, release, tests, tooling, and
   CI that do not belong to the preceding domains

Include every domain materially affected by an Agent TypeSpec change. Use an
empty array when no domain implementation is required.

## Output Contract

Return only this YAML shape, with no fence, preamble, or additional key:

```yaml
lane: BEHAVIOR
ux_mode: SHAPE
affected_domains:
  - client
reason: 'Adds a new primary user task without a material architecture decision.'
```

- `lane`: `DIRECT | BEHAVIOR | ARCHITECTURE`
- `ux_mode`: `NONE | CONTINUITY | SHAPE`
- `affected_domains`: unique values from `client`, `agent`, `sdk`, `build`
- `reason`: one evidence-backed sentence covering all selected fields

## Prohibitions

- Do not turn a requested means into the customer outcome.
- Do not add domains or ceremony from convention or filenames alone.
- Do not guess unresolved material decisions.
- Do not author Specs, design, tasks, or code while classifying.
