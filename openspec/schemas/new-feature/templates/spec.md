## ADDED Requirements

<!-- This file defines enduring specification only. -->
<!-- MUST NOT write implementation tasks, migration steps, release steps, or change-history prose here. -->
<!-- Bad: "In this migration, replace packages/client/app routes." -->
<!-- Good: "Management Client SHALL keep Agent credentials out of browser-delivered bundles." -->
<!-- MUST describe only enduring end-state constraints; do not write before/after comparisons. -->
<!-- Bad: "旧 Client 構成は build graph に残ってはならない。" -->
<!-- Good: "Client browser-visible modules SHALL NOT import server-only Agent RPC modules." -->
<!-- Bad: "legacy Agent REST dependency の再混入を拒否する。" -->
<!-- Good: "Agent public API SHALL use generated Protobuf RPC services and binary Connect transport." -->
<!-- Avoid words such as `旧`, `新`, `現行`, `変更後`, `移行後`, `不要になった`, `再混入`, `legacy`, `deprecated`. -->

### Requirement: <!-- TODO: Requirement name (short; describes what is possible/guaranteed). -->

**Customer Context**

<!-- TODO: Customer pain/background. Who is affected, when, and what hurts; current workaround; why now; definition of success. -->

**Requirement**

<!-- TODO: Normative MUST/SHALL statements (e.g., The system SHALL ...). Include inputs/outputs/constraints/error cases. -->
<!-- Prefer externally observable behavior, stable constraints, and enduring responsibility boundaries. -->
<!-- Package/path references are allowed only when they describe lasting structural guarantees. -->

#### Scenario: <!-- TODO: Scenario name (short; conveys test intent). --> (<!-- TODO: <DOMAIN>-<LAYER>-S### e.g., AGENT-LIFECYCLE-BE-S001 -->)

- **WHEN** <!-- TODO: Trigger/condition (observable action like click/API call). -->
- **THEN** <!-- TODO: Expected outcome (observable UI/response/side effects/DB/logs). -->
