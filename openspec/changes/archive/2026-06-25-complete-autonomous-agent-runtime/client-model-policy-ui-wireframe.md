# Management Client Default Model Policy UI Wireframe / Specification

- Change: `complete-autonomous-agent-runtime`
- Owner: `unit/client/designer`
- Implementation owner: `unit/client/engineer`
- Implementation target: `packages/client/app/agents/**`, `packages/client/src/components/**`, and `packages/client/src/server/**`
- Status: Design-only artifact. No implementation code, generated RPC output, Agent package file, or task checkbox is changed by this file.
- Related tasks: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9
- Related Scenario IDs: `[CLIENT-MANAGEMENT-S017]`, `[CLIENT-MANAGEMENT-S018]`, `[CLIENT-REGISTRY-S009]`, `[CLIENT-REGISTRY-S010]`, `[AGENT-MODEL-POLICY-S005]`, `[AGENT-LIFECYCLE-S008]`, `[AGENT-LIFECYCLE-S009]`, `[AGENT-SECURITY-S017]`

## 1. Intent and Target Users

### Intent

Give operators a concrete, safe Management Client experience for creating and updating an Agent default model policy without exposing Agent credentials, Provider credentials, raw prompt, raw completion, raw reasoning, generated Agent RPC construction, Connect runtime, or direct Agent RPC/network calls to the browser.

This specification fills the `design.md` gap where `UI Wireframes` currently says `N/A`. It does not replace the OpenSpec requirements; it maps them into route placement, component hierarchy, copy, state behavior, and integration instructions for the Client engineer.

### Target users

| Persona                    | Primary job in this UI                                                                                             | Expected permission behavior                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Operator / Agent admin     | Create a managed Agent with an initial active default model policy; update the default policy from Settings.       | Can validate, save, and inspect safe policy metadata. Browser receives only policy ref/digest/provider/model/status/warnings/version. |
| Auditor / read-only viewer | Inspect which default policy is attached and whether it is usable without seeing secret or raw model payload data. | Mutation controls are disabled with explicit read-only copy; safe summary remains visible.                                            |
| Support engineer           | Triage missing binding, invalid policy, unsupported model, or permission-denied states from safe error categories. | Sees stable category copy and digest/ref metadata only; never sees credentials, stack traces, prompts, completions, or reasoning.     |

Browser users are not Agent principals. The Client server attaches acting-user context and credential material only inside server-only modules before calling generated Agent RPC.

## 2. Non-Negotiable Invariants and Boundaries

1. **Browser-safe data only.** Browser-visible UI may display only `policyRef`, `digest`, `provider`, `model`, `version`, `status`, safe generation parameters, safe validation warnings, and `configVersion` metadata.
2. **No credential exposure.** HTML, JavaScript bundles, Server Action responses, browser storage, error text, logs surfaced to UI, and UI component props must never contain Agent credential secrets, Provider credentials, raw provider tokens, `credentialRef` secret values, JWT signing material, private keys, or authorization headers.
3. **No raw model payload exposure.** UI and Browser-safe props must never contain raw prompt, raw completion, raw chain-of-thought, hidden reasoning, raw model request bodies, or raw model response bodies. If observability is shown later, use digest and safe summary only.
4. **No browser Agent RPC.** Browser-visible modules must not import generated Agent RPC descriptors, `@connectrpc/*`, Connect runtime, server-only Agent RPC factories, or `packages/client/src/server/**`. They must not call `fetch` or any network client against the Agent RPC origin.
5. **No Client Agent API proxy route.** Do not add `/api/client/*`, `/api/agent*`, arbitrary RPC forwarding routes, REST/JSON mirrors, OpenAPI, or Orval surfaces. Server Components and Server Actions are UI-internal boundaries only.
6. **Client D1 is a management ledger only.** Client D1 may keep managed Agent records, credential reference metadata, and optional UI helper metadata such as last-seen safe policy ref/digest/provider/model/validation timestamp. It must not store authoritative model policy bodies, Agent-owned policy repository state, Provider credential values, or Agent domain snapshots.
7. **Agent policy truth comes from Agent RPC server-side.** `GetConfig`, `GetModelPolicy`, `ValidateModelPolicy`, `UpsertModelPolicy`, and `UpdateConfig` are called only from server-only Client code using generated Agent RPC clients.
8. **No optimistic authority for Agent-owned state.** The browser can show pending UI, but it must not optimistically invent digest, version, status, or config version. Those values update only from a successful server response.

## 3. Route / Page / Component Inventory

| Area                                                          | Responsibility                                                                                                                                                | Required placement decision                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/agents/new`                                                 | Create or edit Client ledger registration, collect Agent credential reference metadata, and seed the Agent-owned default model policy for new Agent creation. | Insert an always-open **Default model policy** section after managed Agent identity fields and before **Credential reference**.                                                 |
| `/agents/[agentId]/settings`                                  | Show current config and credential controls, update default model policy, rotate credential reference, and destroy Agent.                                     | Insert **Default model policy summary** and **Default model policy editor** after the page lead/notice area and before the generic **Config** section.                          |
| `packages/client/src/components/model-policy-fields.tsx`      | Browser-safe reusable field group for policy ref/provider/model/generation parameters/status/warnings.                                                        | Must accept only browser-safe props and emit browser-safe form values; no server imports, no generated RPC imports, no credential fields.                                       |
| `packages/client/src/components/model-policy-summary.tsx`     | Browser-safe reusable safe metadata readout for default policy ref/digest/provider/model/version/status/config version/warnings.                              | Must render summary, empty state, loading skeleton, warning list, and permission-denied/read-only state without secret-like values.                                             |
| `agent-registration-form.tsx`                                 | Parent Client Component for `/agents/new`.                                                                                                                    | Use `ModelPolicyFields` inside the existing `<Form>` before `CredentialReferenceSection`; extend validation summary/focus order for policy fields.                              |
| `agent-settings-form.tsx`                                     | Parent Client Component for `/agents/[agentId]/settings`.                                                                                                     | Use `ModelPolicySummary` and `ModelPolicyFields` before `AgentConfigSection`; add validate/save handlers for model policy mutation state.                                       |
| `schemas/agent-registration.ts`, `schemas/agent-settings.ts`  | Client-side validation mirrors for immediate operator feedback.                                                                                               | Add model policy field order, labels, and Zod validation. Final write validity remains server-side.                                                                             |
| `packages/client/src/server/actions/model-policies.ts`        | Server-only Agent RPC boundary for validate/upsert/get/archive-safe flows.                                                                                    | New file for task 6.1. It must import `server-only`, generated Agent RPC clients, and error normalization only server-side. Return Browser-safe view models.                    |
| `agent-lifecycle.ts`, `agent-operations.ts`                   | Existing server actions for create/settings flows.                                                                                                            | Creation sends initial policy seed and `initialConfig.modelPolicyRef` in one server-side flow. Settings upserts policy first, then calls `UpdateConfig` only for the saved ref. |
| `/agents/new/page.tsx`, `/agents/[agentId]/settings/page.tsx` | Server Component route shells.                                                                                                                                | Fetch/pass only safe policy defaults/metadata; route code remains server-side and must not expose Agent RPC construction to child Client Components.                            |

## 4. Shared Visual Direction

Preserve the existing dark **control-room** language from `packages/client/app/globals.css`:

- Use the current `ControlRoomFrame`, `.topline`, `.page-band`, `.readout`, `.eyebrow`, `.lead`, `.form-field`, `.form-control`, `.form-helper`, `.state-*`, and `SignalBadge` conventions.
- Do not introduce a generic light SaaS dashboard or new palette. Use existing tokens: `--paper`, `--ink`, `--coal`, `--panel`, `--line`, `--signal`, `--cyan`, `--muted`, `--error`.
- Model policy sections should feel like a **flight computer safety rail**: terse monospace labels, digest/status readouts, warning strips, and explicit “server-side only” helper copy.
- Required visual motif: policy metadata is displayed as instrument readouts, not as raw JSON. The generic Config JSON editor remains below and must not be the primary way to change default policy.

## 5. `/agents/new` Wireframe

### 5.1 Desktop layout

```text
ControlRoomFrame(title="Agent registry › new", signalLabel="registration", currentSection="new")
└─ Page band
   ├─ Eyebrow: Registration
   ├─ H2: Capture references, not secrets.
   ├─ Lead copy
   └─ Form
      ├─ FormErrorSummary
      ├─ Field: Agent ID
      ├─ Field: Agent RPC origin
      ├─ Field: Display name
      ├─ Field: Sort order (optional)
      ├─ Fieldset / readout: Default model policy        ← new section
      │  ├─ Header row: eyebrow "Model execution" + status badge "active on create"
      │  ├─ Helper copy about Agent-owned policy ref
      │  ├─ Two-column field grid on desktop
      │  │  ├─ Policy ref
      │  │  ├─ Provider
      │  │  ├─ Model ID
      │  │  ├─ Temperature
      │  │  ├─ Top P
      │  │  └─ Max output tokens
      │  ├─ Validation warning/error panel
      │  └─ Secondary action: Validate policy
      ├─ details[open]: Credential reference
      └─ Action row: Cancel / Register Agent
```

Placement rationale:

- Managed Agent identity stays first because it scopes every server action and Agent-owned policy seed.
- Default model policy appears before credential reference so operators understand the runtime default before entering the Client-side credential reference metadata.
- Credential reference remains visually separate and keeps its existing copy: “The Client stores a reference, key ID, masked hint, and status. The secret itself is resolved server-side only.”

### 5.2 Mobile layout

- Single-column form.
- The **Default model policy** fieldset is always open and appears after **Sort order (optional)**.
- Generation parameters stack in this order: Temperature, Top P, Max output tokens.
- Action row sticks near the bottom of the viewport only if the existing form action pattern supports it; otherwise keep the current `.action-row` order and ensure it remains reachable after warnings.
- Validation warning panel appears immediately above **Validate policy** and **Register Agent** so screen-reader and keyboard users encounter blocking guidance before submit.

### 5.3 Exact user-facing copy

Page-level copy remains:

- Eyebrow: `Registration`
- Heading: `Capture references, not secrets.`
- Lead: `Register a managed Agent by its ID and RPC origin. Credential references are stored as masked hints — never plaintext secrets.`

New section copy:

| Element                   | Exact copy                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fieldset legend / heading | `Default model policy`                                                                                                                                     |
| Eyebrow                   | `Model execution`                                                                                                                                          |
| Intro helper              | `Seed the Agent-owned policy that future Runs resolve by reference. The browser sees only ref, provider, model, parameters, status, warnings, and digest.` |
| Server boundary helper    | `Validation and save happen through server-side Agent RPC. No Provider credential or Agent RPC credential is sent to the browser.`                         |
| Status badge              | `active on create`                                                                                                                                         |
| Validate button           | `Validate policy`                                                                                                                                          |
| Validate pending          | `Validating policy…`                                                                                                                                       |
| Submit pending            | `Registering Agent and seeding policy…`                                                                                                                    |
| Final submit button       | `Register Agent`                                                                                                                                           |
| Success redirect status   | Existing redirect to `/agents/{agentId}`. If a status line is shown before redirect: `Agent registered with default policy {policyRef}.`                   |

### 5.4 Field labels, help text, defaults, and validation

All values are browser-safe policy draft metadata. Server-side validation remains authoritative.

| Field name                    | Label                 | Control                                                                   | Default / placeholder                         | Help text                                                                                                                        | Client validation                                                    | Server error placement                                                                                                              |
| ----------------------------- | --------------------- | ------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `modelPolicy.policyRef`       | `Policy ref`          | Text input                                                                | `workers-ai-default`                          | `Agent-owned reference used by AgentConfig.modelPolicyRef. Use lowercase kebab-case, e.g. workers-ai-default.`                   | Required; trim; lowercase kebab-case; 1–64 chars; no spaces.         | Field error under Policy ref.                                                                                                       |
| `modelPolicy.provider`        | `Provider`            | Select                                                                    | `workers-ai`                                  | `Only Workers AI is available for this change. Provider credentials are resolved server-side and are never shown here.`          | Required; only `workers-ai` is enabled.                              | Field error under Provider.                                                                                                         |
| `modelPolicy.model`           | `Model ID`            | Text input; may become a combobox if the server provides a safe allowlist | Placeholder: `@cf/meta/llama-3.1-8b-instruct` | `Workers AI model identifier. The Agent validates support before saving.`                                                        | Required; trim; max 160 chars; reject whitespace/control characters. | Field error under Model ID.                                                                                                         |
| `modelPolicy.temperature`     | `Temperature`         | Number input with `step="0.01"`; show value as monospace                  | `0.20`                                        | `0.00–2.00. Lower is steadier; higher is more exploratory.`                                                                      | Required; number; min 0; max 2; up to 2 decimal places.              | Field error under Temperature.                                                                                                      |
| `modelPolicy.topP`            | `Top P`               | Number input with `step="0.01"`                                           | `0.90`                                        | `0.01–1.00 nucleus sampling cap. Keep at 1.00 only when temperature is already constrained.`                                     | Required; number; min 0.01; max 1; up to 2 decimal places.           | Field error under Top P.                                                                                                            |
| `modelPolicy.maxOutputTokens` | `Max output tokens`   | Number input with integer step                                            | `1024`                                        | `1–8192 token response cap for one model call. Model-specific limits are checked server-side.`                                   | Required; integer; min 1; max 8192.                                  | Field error under Max output tokens.                                                                                                |
| `modelPolicy.status`          | `Policy status`       | Read-only status badge in creation flow                                   | `active`                                      | `Initial default policies must be active. Disabled or archived policies cannot be selected for Runs.`                            | Not editable in creation flow.                                       | If server returns non-active status, show form error: `The default model policy must be active before Agent creation can continue.` |
| `modelPolicy.warnings`        | `Validation warnings` | Non-editable warning list with `role="status"` and `aria-live="polite"`   | Empty                                         | `Warnings are safe metadata from Agent validation. They never include Provider credentials, prompts, completions, or reasoning.` | None; render after validation response.                              | Warning list in section; blocking errors also appear in FormErrorSummary.                                                           |

### 5.5 `/agents/new` states

| State                      | Behavior                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial / empty            | Show defaults above. `Validate policy` is disabled until Policy ref, Provider, Model ID, Temperature, Top P, and Max output tokens pass client validation. Warning panel is hidden.                                                                    |
| Loading route data         | Current page has little server data; if edit mode loads existing Agent, show `.state-loading` skeleton rows for identity and policy fields. Do not show fake digest/version.                                                                           |
| Client validation          | `FormErrorSummary` includes policy fields in this order after `displayOrder`: Policy ref, Provider, Model ID, Temperature, Top P, Max output tokens. Focus first invalid field.                                                                        |
| Validate pending           | Disable policy fields and `Register Agent`; `Validate policy` text becomes `Validating policy…`; section gets amber pending dot with `aria-live="polite"`.                                                                                             |
| Validate success           | Show cyan status line: `Policy draft is valid for Workers AI.` If warnings exist, show `Policy draft is valid with warnings.` and list warnings. Do not show digest unless server validation returns a draft digest explicitly marked safe.            |
| Submit pending             | Disable entire form. Submit button text becomes `Registering Agent and seeding policy…`. Browser must not optimistically show final digest, version, or config version.                                                                                |
| Submit success             | Server registers the Client ledger record, validates/upserts initial policy seed, initializes Agent with `initialConfig.modelPolicyRef`, and redirects to `/agents/{agentId}`.                                                                         |
| Unsupported provider/model | Field-level error under Provider or Model ID. Form-level safe copy: `This provider or model is not supported for this Agent. No policy was saved.`                                                                                                     |
| Missing Workers AI binding | Form-level safe copy: `Model execution is unavailable because Workers AI is not configured for the Agent Worker. No policy was saved.`                                                                                                                 |
| Permission denied          | Focus `FormErrorSummary`; show `You do not have permission to create or validate a default model policy for this Agent.` Disable submit until permissions change or the user leaves the page.                                                          |
| Server unavailable         | Safe form error: `Agent policy validation is temporarily unavailable. Retry without changing credential details.` Provide retry through the same `Validate policy` button; do not expose stack traces or RPC metadata.                                 |
| Validation warnings        | Show yellow/amber warning list with title `Policy validation warnings`. Warnings do not block submit unless the server marks them as errors. Example safe warning copy: `Workers AI readiness is degraded; Runs may fail until capability is serving.` |

## 6. `/agents/[agentId]/settings` Wireframe

### 6.1 Desktop layout

```text
ControlRoomFrame(title="Agent registry › {agentId}", signalLabel="settings", currentSection="settings")
└─ Page band
   ├─ Eyebrow: Settings
   ├─ H2: Agent configuration and credentials
   ├─ AgentToken(agentId)
   ├─ Lead: Managing {displayName}. Changes are sent through server-side Agent RPC.
   ├─ Initial notice / error / success regions
   ├─ ModelPolicySummary                         ← new summary readout
   ├─ Model policy editor section                ← new structured editor
   │  ├─ Header: Default model policy
   │  ├─ Safe metadata side rail on desktop
   │  ├─ ModelPolicyFields
   │  └─ Actions: Validate policy / Save default policy
   ├─ AgentConfigSection                         ← existing generic config, below policy editor
   ├─ CredentialRotationSection                  ← existing credential reference controls
   ├─ DangerZoneSection
   └─ ConfirmDialog for destroy
```

Placement rationale:

- Default model policy is a primary execution setting and must not be hidden inside the generic Config JSON editor.
- `AgentConfigSection` remains available for non-policy config keys, but its helper copy must say: `Default model policy is managed above. Config JSON updates cannot override modelPolicyRef.`
- Credential rotation stays below config and policy because Agent credential references are not Provider policy values.

### 6.2 Mobile layout

- Summary readout appears before editable fields.
- Safe metadata side rail collapses into stacked key/value rows.
- Actions appear immediately after warnings: `Validate policy`, then `Save default policy`.
- `AgentConfigSection`, credential rotation, and danger zone remain below the policy section in that order.

### 6.3 Exact user-facing copy

Page-level copy remains:

- Eyebrow: `Settings`
- Heading: `Agent configuration and credentials`
- Lead: `Managing {displayName}. Changes are sent through server-side Agent RPC.`

New summary copy:

| Element                   | Exact copy                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Summary heading           | `Default model policy`                                                                                         |
| Summary intro             | `Current Agent-owned policy metadata. The policy body and credentials stay inside the Agent service boundary.` |
| Empty summary             | `No default model policy is attached. Save an active Workers AI policy before publishing Events.`              |
| Safe digest helper        | `Digest verifies the saved policy metadata. It is not a prompt, completion, credential, or provider secret.`   |
| Config version helper     | `Config version increments only after the saved policy ref is attached to AgentConfig.modelPolicyRef.`         |
| Permission denied summary | `You can view safe metadata, but you do not have permission to update the default model policy.`               |

New editor copy:

| Element              | Exact copy                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section heading      | `Edit default model policy`                                                                                                                         |
| Intro helper         | `Upsert the Agent-owned policy first, then attach the saved ref to AgentConfig.modelPolicyRef. The browser receives only the safe result metadata.` |
| Validate button      | `Validate policy`                                                                                                                                   |
| Save button          | `Save default policy`                                                                                                                               |
| Validate pending     | `Validating policy…`                                                                                                                                |
| Save pending         | `Saving default policy…`                                                                                                                            |
| Save success         | `Default model policy saved as {policyRef}; config updated to v{configVersion}.`                                                                    |
| Active status helper | `Only active policies can be the Agent default.`                                                                                                    |

### 6.4 Safe metadata labels

`ModelPolicySummary` must render these labels exactly when values exist:

| Label                   | Value format / behavior                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `Policy ref`            | Monospace `policyRef`                                                                                |
| `Digest`                | Monospace digest; allow wrapping; do not truncate without an accessible full text.                   |
| `Provider`              | `workers-ai` or safe provider label from server.                                                     |
| `Model`                 | Safe model ID.                                                                                       |
| `Policy version`        | `v{version}`.                                                                                        |
| `Status`                | `active`, `disabled`, `archived`, `validation pending`, or `unavailable` as text plus `SignalBadge`. |
| `Config version`        | `v{configVersion}` or `not attached` if no config ref exists.                                        |
| `Generation parameters` | `temperature {temperature} · top_p {topP} · max_output_tokens {maxOutputTokens}`.                    |
| `Warnings`              | Count badge plus list. If none: `No validation warnings.`                                            |

### 6.5 Settings states

| State                            | Behavior                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading policy metadata          | Summary renders `.state-loading` skeleton rows for labels only. No fake digest, version, provider, model, or status. Editor fields are disabled until initial safe metadata is available or confirmed absent.                                          |
| Current policy present / active  | Summary shows all safe metadata. Editor initializes from current safe metadata. Save button is disabled until any field changes and client validation passes.                                                                                          |
| Empty / missing default          | Summary shows empty copy. Editor initializes to creation defaults. Save button copy remains `Save default policy`.                                                                                                                                     |
| Current policy disabled/archived | Summary status badge uses destructive/muted styling and copy: `The referenced policy is {status}. Runs will fail until an active policy is saved.` Editor stays usable if user has permission, with status fixed to active on save.                    |
| Client validation errors         | Field messages render under the relevant field. Error summary includes policy fields in section order. Focus moves to first invalid field.                                                                                                             |
| Validate pending                 | Disable policy fields and save button; validate button text `Validating policy…`; show amber pending status with `aria-live="polite"`.                                                                                                                 |
| Validate success                 | Show cyan status: `Policy draft is valid for Workers AI.` If warnings exist, show `Policy draft is valid with warnings.`                                                                                                                               |
| Save pending                     | Disable policy fields, Config editor, credential rotation, and danger controls to avoid overlapping mutations. Show `Saving default policy…`; do not optimistically update digest/config version.                                                      |
| Save success                     | Update summary from server response only. Show success line `Default model policy saved as {policyRef}; config updated to v{configVersion}.` Call route refresh/invalidation so `GetConfig` and `GetModelPolicy` safe metadata are reread server-side. |
| Unsupported provider/model       | Show field-level error and form-level safe copy: `This provider or model is not supported for this Agent. The current default policy was not changed.`                                                                                                 |
| Invalid policy                   | Show form-level safe copy: `The policy draft is invalid. Fix the highlighted fields and validate again.`                                                                                                                                               |
| Missing Workers AI binding       | Show warning/error readout depending server category: `Model execution is unavailable because Workers AI is not configured for the Agent Worker. The current default policy was not changed.`                                                          |
| Permission denied                | Summary remains visible. Editor fields and buttons are disabled with inline copy: `You do not have permission to update the default model policy.` Focus lands on this notice if a denied mutation was attempted.                                      |
| Server unavailable               | Summary keeps last server-rendered safe metadata. Editor shows `Agent policy service is temporarily unavailable. Retry validation or save after connectivity is restored.` No stack/RPC internals.                                                     |
| Validation warnings              | Warnings appear under the fields and in the summary. Warnings use `role="status"`, not `role="alert"`, unless the server marks them blocking.                                                                                                          |
| Concurrent mutation disabled     | While policy save is pending, Config/Credential/Danger actions are disabled with existing pending state. While credential rotation is pending, policy save is disabled with helper: `Finish the credential operation before changing model policy.`    |

## 7. Shared Component Specifications

### 7.1 `model-policy-fields.tsx`

Purpose: reusable browser-safe form section for model policy draft input and validation display.

Implementation constraints:

- This is a Client Component only if it needs interactive form behavior. It must not import `packages/client/src/server/**`, generated Agent RPC, Connect runtime, D1 modules, Agent package code, or any credential resolver.
- Props and state must contain only browser-safe policy draft values and safe validation metadata.
- It may integrate with `react-hook-form` like the existing registration/settings forms, but the component must remain a pure field renderer. Server Action calls are owned by parent form handlers.

Recommended browser-safe prop contract:

```ts
type ModelPolicyMode = 'create' | 'settings';
type ModelPolicyValidationStatus =
  | 'idle'
  | 'validating'
  | 'valid'
  | 'warning'
  | 'invalid'
  | 'permission_denied'
  | 'unavailable';

interface BrowserSafeModelPolicyDraft {
  readonly policyRef: string;
  readonly provider: 'workers-ai';
  readonly model: string;
  readonly temperature: string;
  readonly topP: string;
  readonly maxOutputTokens: string;
  readonly status: 'active';
}

interface BrowserSafeModelPolicyWarning {
  readonly code: string;
  readonly message: string;
}

interface ModelPolicyFieldsProps {
  readonly mode: ModelPolicyMode;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly pendingLabel?: string;
  readonly validationStatus: ModelPolicyValidationStatus;
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
  readonly fieldErrors: Partial<Record<keyof BrowserSafeModelPolicyDraft, string>>;
  readonly safeProviderOptions: readonly { readonly value: 'workers-ai'; readonly label: string }[];
  readonly safeModelSuggestions?: readonly {
    readonly value: string;
    readonly label: string;
    readonly provider: 'workers-ai';
  }[];
}
```

Forbidden prop names and values:

- `credentialRef`, `providerCredential`, `agentCredential`, `authorization`, `headers`, `token`, `secret`, `prompt`, `completion`, `reasoning`, `rawRequest`, `rawResponse`, `connectClient`, `rpcClient`, `transport`, `agentRpcOrigin`.

Required hierarchy:

```text
<fieldset aria-labelledby="model-policy-heading" aria-describedby="model-policy-helper model-policy-boundary-helper">
  <legend id="model-policy-heading">Default model policy</legend>
  <p id="model-policy-helper">...</p>
  <p id="model-policy-boundary-helper">...</p>
  <ModelPolicyStatusLine />
  <PolicyRefField />
  <ProviderField />
  <ModelField />
  <GenerationParameterGrid />
  <ValidationPanel />
</fieldset>
```

Focus order:

1. Policy ref
2. Provider
3. Model ID
4. Temperature
5. Top P
6. Max output tokens
7. Validate policy
8. Save/Register action owned by parent form

Keyboard behavior:

- Standard Tab/Shift+Tab order above.
- Enter in text/number fields submits the parent form only when no validation button has focus; final submit must still revalidate server-side.
- Escape does not clear field values.
- Disabled fields use native `disabled` where no interaction is possible; read-only status uses text/badge, not a disabled input.

Accessibility:

- Every input has a visible label and `aria-describedby` linking help text and field error.
- Field-level errors use text adjacent to the field and are included in the parent `FormErrorSummary`.
- Warning panel uses `role="status"` and `aria-live="polite"`.
- Blocking server errors use `role="alert"` in the parent error summary.
- Status badges include text, not color alone.

Responsive behavior:

- Desktop: two-column field grid, with generation parameters in a three-column row.
- Mobile: single-column in the focus order listed above.
- Long model IDs and digests wrap with `overflow-wrap: anywhere`.

### 7.2 `model-policy-summary.tsx`

Purpose: browser-safe safe metadata readout for current default policy and config attachment state.

Implementation constraints:

- Display-only component.
- Must not import server-only modules, generated Agent RPC, Connect runtime, D1 modules, Agent runtime code, or credential resolution logic.
- Must never render fields that are not in the safe metadata contract.

Recommended browser-safe prop contract:

```ts
type BrowserSafeModelPolicyStatus =
  | 'active'
  | 'disabled'
  | 'archived'
  | 'validation_pending'
  | 'unavailable';

interface BrowserSafeModelPolicyMetadata {
  readonly policyRef: string;
  readonly digest: string;
  readonly provider: 'workers-ai';
  readonly model: string;
  readonly version: string;
  readonly status: BrowserSafeModelPolicyStatus;
  readonly configVersion?: string;
  readonly generationParameters: {
    readonly temperature: string;
    readonly topP: string;
    readonly maxOutputTokens: string;
  };
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
}

interface ModelPolicySummaryProps {
  readonly metadata?: BrowserSafeModelPolicyMetadata;
  readonly loading: boolean;
  readonly permissionDenied: boolean;
  readonly emptyMessage?: string;
}
```

Required hierarchy:

```text
<section class="readout" aria-labelledby="model-policy-summary-heading">
  <strong id="model-policy-summary-heading">Default model policy</strong>
  <p>Current Agent-owned policy metadata...</p>
  <KeyValueGrid>
    Policy ref / Digest / Provider / Model / Policy version / Status / Config version / Generation parameters
  </KeyValueGrid>
  <WarningsList />
  <PermissionDeniedNotice />
</section>
```

State rendering:

- `loading=true`: render skeleton label rows only.
- `metadata=undefined && !loading`: render empty copy.
- `permissionDenied=true`: render summary if available, then disabled notice copy.
- `status=disabled|archived`: render destructive/muted badge and Run failure warning copy.
- Warnings list is always safe text supplied by server-side normalization.

Accessibility:

- Use `<dl>` for key/value metadata.
- Digest and model values are selectable text and wrap instead of truncating silently.
- Permission notice uses `role="status"` for initial render and `role="alert"` if displayed after a denied mutation attempt.

## 8. Data and Server Action Integration Instructions for `unit/client/engineer`

### 8.1 Browser-safe view models

Create or extend Browser-safe types under Client server actions. The exact implementation names may vary, but the browser boundary must contain only this data shape:

```ts
interface BrowserSafeModelPolicyDraftInput {
  readonly policyRef: string;
  readonly provider: 'workers-ai';
  readonly model: string;
  readonly generationParameters: {
    readonly temperature: string;
    readonly topP: string;
    readonly maxOutputTokens: string;
  };
}

interface BrowserSafeModelPolicyMutationResult {
  readonly ok: boolean;
  readonly metadata?: BrowserSafeModelPolicyMetadata;
  readonly fieldErrors?: Partial<Record<string, string>>;
  readonly formError?: string;
  readonly warnings: readonly BrowserSafeModelPolicyWarning[];
}
```

Do not return raw generated RPC messages directly to Client Components. Normalize generated messages to Browser-safe plain objects.

### 8.2 Server action sequence

Creation flow (`/agents/new`):

1. Validate browser input with Client schema for fast feedback.
2. Server action revalidates all fields.
3. Server action validates/upserts or sends the initial model policy seed through generated Agent RPC server-side.
4. `InitializeAgent` receives initial model policy seed and `initialConfig.modelPolicyRef = policyRef` in the same server-side flow.
5. Client D1 stores only managed Agent ledger data, credential reference metadata, and optional safe helper metadata if needed; never store authoritative policy body or secrets.
6. Return success with `agentId` and redirect. Do not return credential material or raw Agent RPC payloads.

Settings flow (`/agents/[agentId]/settings`):

1. Server Component reads safe current config and safe default policy metadata server-side.
2. User edits fields in `ModelPolicyFields`.
3. `Validate policy` calls server-only `ValidateModelPolicy` and returns safe field errors/warnings.
4. `Save default policy` calls server-only `UpsertModelPolicy` first.
5. Only if upsert succeeds and returns an active saved policy ref, call `UpdateConfig` with `modelPolicyRef` set to that saved ref.
6. Return safe `metadata`, warnings, and `configVersion`; refresh route data.
7. If upsert fails, do not call `UpdateConfig`; existing config version remains unchanged.

### 8.3 Likely implementation files

`unit/client/engineer` should update or add these files without changing this specification’s boundaries:

- `packages/client/src/server/actions/model-policies.ts`: new server-only validate/upsert/get safe metadata actions using generated Agent RPC. Add `import 'server-only';` at the top.
- `packages/client/src/server/actions/agent-lifecycle.ts`: extend creation/initialization path to send initial model policy seed and config ref; extend `BrowserSafeAgentConfig` only with safe default policy metadata if needed.
- `packages/client/src/server/actions/agent-operations.ts`: if Settings mutations live here, add ordered upsert-then-UpdateConfig flow and safe error normalization.
- `packages/client/src/server/actions/browser-safe-helpers.ts`: add helper normalization for safe model policy metadata, generation parameters, warnings, and stable error categories.
- `packages/client/src/components/model-policy-fields.tsx`: add the field component specified in §7.1.
- `packages/client/src/components/model-policy-summary.tsx`: add the summary component specified in §7.2.
- `packages/client/src/components/agent-registration-form.tsx`: place `ModelPolicyFields` after `displayOrder` and before `CredentialReferenceSection`; update pending labels and error summary.
- `packages/client/src/components/agent-settings-form.tsx`: place `ModelPolicySummary` and `ModelPolicyFields` before `AgentConfigSection`; add policy validate/save handlers and success/error copy.
- `packages/client/src/components/schemas/agent-registration.ts`: add model policy fields to field order, labels, Zod schema, validation helper, and submit result field error type.
- `packages/client/src/components/schemas/agent-settings.ts`: add reusable model policy schema/order or import a shared browser-safe schema if the engineer creates `schemas/model-policy.ts`.
- `packages/client/app/agents/new/page.tsx`: pass the server action that performs registration plus initial policy seed.
- `packages/client/app/agents/[agentId]/settings/page.tsx`: fetch safe policy metadata server-side and pass it to `AgentSettingsForm`; map permission/not_found/unavailable categories to safe copy.
- `packages/client/src/tests/*.test.tsx` and server action tests: cover `[CLIENT-MANAGEMENT-S017]`, `[CLIENT-MANAGEMENT-S018]`, `[CLIENT-REGISTRY-S009]`, `[CLIENT-REGISTRY-S010]`.

### 8.4 Files and imports that must not be edited or imported by browser components

- Do not hand-edit `packages/agent/proto/**`, `packages/agent/src/generated/rpc/**`, or `packages/client/src/generated/agent-rpc/**`.
- Do not edit `packages/agent/**` for this UI implementation task unless a separate `unit/agent/engineer` task owns it.
- Browser-visible Client modules must not import generated Agent RPC, `@connectrpc/connect`, server-only Agent RPC factories, D1 repository modules, credential resolver modules, or Agent runtime source.
- Do not add Client App Router API proxy routes.

## 9. Error and Warning Copy Mapping

Map server-side categories to these safe messages before rendering in browser-visible components:

| Category / condition   | Field-level behavior                                         | Form-level safe copy                                                                                                                    |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_policy`       | Highlight the invalid field(s).                              | `The policy draft is invalid. Fix the highlighted fields and validate again.`                                                           |
| `unsupported_provider` | Provider error.                                              | `This provider is not supported for this Agent. The current default policy was not changed.`                                            |
| `unsupported_model`    | Model ID error.                                              | `This model is not supported for this Agent. The current default policy was not changed.`                                               |
| `missing_binding`      | No field error unless server identifies one.                 | `Model execution is unavailable because Workers AI is not configured for the Agent Worker. The current default policy was not changed.` |
| `permission_denied`    | Disable all mutation controls.                               | `You do not have permission to update the default model policy.`                                                                        |
| `not_found`            | Policy ref error if ref is missing; otherwise summary error. | `The Agent does not have that model policy ref. Save an active policy before attaching it as the default.`                              |
| `failed_precondition`  | Highlight status/ref if applicable.                          | `Only active model policies can be attached as the Agent default.`                                                                      |
| `unavailable`          | No field error.                                              | `Agent policy service is temporarily unavailable. Retry validation or save after connectivity is restored.`                             |
| Unknown safe failure   | No raw details.                                              | `Default model policy could not be saved. Retry after verifying the highlighted fields.`                                                |

Warning copy rules:

- Warning text must be supplied by server-side normalization or a fixed browser-safe table.
- Warnings must not include credential values, headers, prompts, completions, reasoning, raw request bodies, raw response bodies, stack traces, or internal RPC endpoint details.
- Warnings do not block save unless the server marks the result invalid.

## 10. Validation, Focus, Keyboard, and Accessibility Requirements

### 10.1 Field order

Registration field order becomes:

1. Agent ID
2. Agent RPC origin
3. Display name
4. Sort order
5. Policy ref
6. Provider
7. Model ID
8. Temperature
9. Top P
10. Max output tokens
11. Credential reference
12. Key ID
13. Public fingerprint
14. Masked hint
15. Credential status

Settings policy field order becomes:

1. Policy ref
2. Provider
3. Model ID
4. Temperature
5. Top P
6. Max output tokens
7. Validate policy
8. Save default policy
9. Config editor
10. Credential rotation controls
11. Danger zone controls

### 10.2 Error summary behavior

- On invalid submit, focus the existing `FormErrorSummary` or equivalent error summary first.
- Each summary item links to the relevant field by `id`.
- Server field errors are merged into the same field-level slots as client validation errors.
- Server form errors use `role="alert"` and never include raw exception text unless already mapped by the safe error table.

### 10.3 Keyboard behavior

- Tab order follows field order.
- `Validate policy` is a `button type="button"`; `Register Agent` / `Save default policy` are submit/mutation buttons.
- Enter in a field may submit the form, but the submit handler must run the same validation and server-side checks as clicking the primary action.
- Escape does not discard drafts. Cancel buttons use existing navigation/cancel behavior.
- Disabled controls must have visible reason text nearby. Do not rely on color or disabled styling alone.

### 10.4 Screen-reader behavior

- Use `<fieldset>` and `<legend>` for the policy field group.
- Use `<dl>` for summary metadata.
- Status and warning text must be readable as text. Color and dot badges are supplemental.
- Pending state uses `aria-live="polite"`.
- Blocking errors use `role="alert"`.
- If permission is denied after a mutation attempt, move focus to the permission notice.

## 11. Test and Acceptance Notes for Engineer

Tests should verify these user-visible and boundary outcomes:

- `[CLIENT-MANAGEMENT-S017]`: `/agents/new` collects policy ref/provider/model/generation parameters, sends them through server-side flow, and does not expose Agent/Provider credentials or direct Agent RPC in browser-visible modules.
- `[CLIENT-MANAGEMENT-S018]`: Settings upserts the policy first, updates config only after successful upsert, and refreshes safe summary metadata with policy ref/digest/provider/model/config version.
- `[CLIENT-REGISTRY-S009]`: Client D1 contains no authoritative policy body, Provider secret, raw token, prompt, completion, or reasoning after policy save.
- `[CLIENT-REGISTRY-S010]`: Current policy summary is sourced from server-side Agent RPC and serialized to browser as safe metadata only.
- Component tests should pass secret-like sentinel props and assert they are not rendered by `ModelPolicySummary` when not part of the safe contract.
- Browser secrecy tests should assert Client Components do not import generated Agent RPC, Connect runtime, server-only Agent RPC modules, or D1 modules.

## 12. Assumptions and Open Questions

### Assumptions

- Provider implementation scope for this change is Workers AI only, so `Provider` defaults to `workers-ai` and no other provider option is enabled.
- Exact supported Workers AI model allowlist is an Agent/server responsibility. The browser may show safe suggestions if the server provides them, but final support validation happens server-side.
- Policy digest, policy version, and config version are authoritative only after successful Agent RPC responses.
- Existing control-room styling remains the baseline; this spec does not require a new design system dependency.

### Open questions

- None blocking for one designer pass. If implementation discovers additional generated RPC field names, `unit/client/engineer` should keep the UI copy and browser-safe boundary from this file and adapt only the server-side mapping names.
