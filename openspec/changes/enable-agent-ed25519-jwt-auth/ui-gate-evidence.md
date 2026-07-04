# Client Ed25519 Auth — UI Gate Evidence (Impeccable / design-audit)

本メモは `enable-agent-ed25519-jwt-auth` の presentation-facing Client UI 変更に対する
Impeccable / design-audit gate の証跡をまとめる。wireframe (`wireframes/*.wireframe.json`) を
UI の正本とし、各 component が wireframe の配置・状態・copy に従っているかと、design-audit の各次元を
確認した結果を記録する。

## Source of truth

- wireframe (JSON 正本):
  - `wireframes/signing-key-management.wireframe.json`
  - `wireframes/trust-config-export.wireframe.json`
  - `wireframes/agent-signing-key-select-health.wireframe.json`
  - `wireframes/key-rotation-revoke-recovery.wireframe.json`
  - `wireframes/connected-happy-path.wireframe.json`
- PRODUCT.md register = `product`。anti-reference が「Shadcn 既定 token から逸脱する ad-hoc palette / route 固有 CSS」を禁止。既存 design system grammar (Shadcn primitive + 既定 token) を継承する。

## Impeccable detector evidence

- command: `node .opencode/skills/impeccable/scripts/detect.mjs <changed UI paths>`
- targets: `packages/client/src/components/signing-key-management.tsx`, `trust-config-export.tsx`, `agent-signing-key-select.tsx`, `key-rotation-guide.tsx`, `packages/client/app/global-settings/{page,signing-keys/page,trust-config-export/page,key-rotation/page}.tsx`, `packages/client/app/agents/[agentId]/settings/page.tsx`
- result: **EXIT=0 (no findings)** — gradient text / side-stripe border / glassmorphism default / bounce easing / 全 section eyebrow / card 重畳などの banned pattern なし。

### 2026-06-28 追加 UI gate evidence (trust-config-export lint-only delta)

- changed UI path: `packages/client/src/components/trust-config-export.tsx`
- change type: trust status selection の内部 state を object record から `ReadonlyMap` に変更しただけで、markup、copy、token、spacing、色、motion、responsive layout は変更していない。
- Impeccable command: `node .opencode/skills/impeccable/scripts/detect.mjs packages/client/src/components/trust-config-export.tsx`
- result: **EXIT=0 (no findings)** — 追加変更による banned pattern なし。
- design-audit protocol result: **PASS / no visual delta**。Visual Hierarchy、Spacing & Rhythm、Typography、Color、Alignment & Grid、Components、Iconography、Motion、States、Density、Responsiveness、Accessibility は既存 UI evidence と同一。state container の変更は object-injection lint warning を解消する内部実装であり、wireframe の Broad Permission Warning と Schema Validation Result の同時表示、および public-only JSON preview の配置を変えない。

## design-audit protocol 適用結果 (trust-config-export.tsx 同時表示変更の明示証跡)

直近の変更 (broad permission warning と schema validation result の同時独立表示) を含め、
`trust-config-export.tsx` を設計 audit の各観点で確認した結果:

| Dimension                      | Result | 根拠                                                                                                                                                                                                     |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual Hierarchy               | OK     | display heading (`text-2xl font-semibold`) → caption → form controls → JSON preview → result alerts。result alerts は `space-y-4` で縦に並び、warning と validation を同時に視認できる。                 |
| Spacing & Rhythm               | OK     | `space-y-6` (全体) / `gap-6 lg:grid-cols-[380px_1fr]` (form 2 column) / `space-y-4` (alerts group)。一定の rhythm。                                                                                      |
| Typography                     | OK     | 既定 font stack。fingerprint/kid は `font-mono text-xs`、code token (`AGENT_CONTROL_PLANE_TRUST` / `d`) は `<code className="font-mono">`。                                                              |
| Color                          | OK     | Shadcn 既定 token のみ (`text-muted-foreground`, `bg-muted` preview, `Badge` variant `outline/secondary/destructive`, `Alert variant="destructive"`)。新規 ad-hex 色なし。                               |
| Alignment & Grid               | OK     | `grid gap-6 lg:grid-cols-[380px_1fr]` で policy controls / preview を分離。alerts は full-width fragment。                                                                                               |
| Components                     | OK     | 既存 Shadcn primitive (Card/Button/Badge/RadioGroup/Checkbox/Input/Alert/Label) のみ再利用。新規 control 重複なし。                                                                                      |
| Motion / States                | OK     | submitting/saving/verifying 状態は button disable + "Generating…/Saving…/Verifying…" label。bounce/elastic easing なし。                                                                                 |
| Empty / Loading / Error States | OK     | empty: "No active signing keys…"、loading: button label、error: `Alert variant="destructive"` schema validation、success: `Alert` validation passed。全状態カバー。                                      |
| Density                        | OK     | 各要素が機能的意味を持ち、装飾 alone なし。                                                                                                                                                              |
| Responsiveness                 | OK     | `grid` + `lg:` breakpoint、`flex-wrap`、`break-all` (fingerprint)、`sm:grid-cols-2` (scope checkboxes / diagnostic)。                                                                                    |
| Accessibility                  | OK     | `role="status"` / `role="alert"` / `aria-label` / `<Label htmlFor>` / `<fieldset><legend>` なし→代わりに `<Label>` group / disabled 属性。warning と validation は別 Alert で screen reader が両方通知。 |

wireframe (`trust-config-export.wireframe.json:94-95`) は Broad Permission Warning と Schema Validation Result を別要素として定義しており、同時表示実装は wireframe に合致する。

## design-audit protocol 適用結果 (全体)

audit の各次元について新規 UI を確認した結果:

| Dimension        | Result                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual Hierarchy | OK。各 page は display heading (`text-2xl font-semibold`) + caption eyebrow (単一、全 section 反射ではない) + 本文 (`text-sm text-muted-foreground`)。primary action = Generate Key Button を header 直下に配置。 |
| Spacing & Rhythm | OK。`space-y-6` / `gap-4` / `gap-6` で縦横の rhythm を統一。card 内は `space-y-3`。                                                                                                                               |
| Typography       | OK。既定 font stack。見出し最大 `text-2xl`(display heading ceiling 内)。`font-mono text-xs` で fingerprint/kid を区別。                                                                                           |
| Color            | OK。Shadcn 既定 token (`text-muted-foreground`, `Badge` variant `outline/secondary/destructive`) のみ。gray text は `text-muted-foreground` token 経由で既定 contrast を維持。新規 ad-hex 色なし。                |
| Alignment & Grid | OK。`grid gap-6 lg:grid-cols-[380px_1fr]` / `md:grid-cols-2 xl:grid-cols-4` で 2D layout。table は既定 `Table` primitive。                                                                                        |
| Components       | OK。既存 Shadcn primitive (Card/Button/Badge/RadioGroup/Checkbox/Input/Alert/Table/Label) のみ再利用。新規 control を duplicate していない。                                                                      |
| Empty States     | OK。`signing-key-management.tsx` に Agent-zero empty state (`EmptySigningKeys`) と Global key 未作成導線 (`agent-signing-key-select.tsx`)。                                                                       |
| Loading States   | OK。client component は `Saving…` / `Verifying…` / `Generating…` の button disable label。                                                                                                                        |
| Error States     | OK。`Alert variant="destructive"` で schema validation / 認証失敗 safe message。接続不成立は `safeMessage`。                                                                                                      |
| Density          | OK。各要素は機能的意味を持ち、装飾 alone の要素なし。                                                                                                                                                             |
| Responsiveness   | OK。`flex-wrap` / `grid` で mobile-desktop。fingerprint は `break-all`。table は `overflow-x-auto`。                                                                                                              |
| Accessibility    | OK。`role="status"` / `role="alert"` / `aria-label` / `<Label htmlFor>` / `<fieldset><legend>` / disabled 状態の `disabled` 属性。keyboard 到達可能 (form/button/radio)。                                         |

## wireframe fidelity

- **Signing Key Management** (`signing-key-management.tsx`): `Global Settings / Signing Keys` caption, display heading, Agent-zero available notice, secret boundary notice, signing key table (Issuer/kid, Public fingerprint, Default, Status, Last used, Actions), lifecycle state (generate/default/disable/delete), public fingerprint 表示。private material 非表示。
- **Trust Config Export** (`trust-config-export.tsx`): `Global Settings / Trust Config Export` caption, display heading, export builder (Issuer / Global Signing Key / Allowed Agent IDs / Allowed Scopes / Client key status→trust status mapping / Broad Permission Warning / Schema Validation Result), JSON preview panel (Public JWK Summary, Copyable JSON, "No private parameter d / no encrypted private JWK / no JWT" caption)。disabled/deleted key は revoked 固定で選択可能。
- **Agent Signing Key Select Health** (`agent-signing-key-select.tsx`): selection form (No Global signing keys state, signing key select, selected issuer/kid/fingerprint read-only, Save Agent Selection, Run Health Check, disabled reason), verification panel (Current Trust Match, Last Verified At, Safe Diagnostic Codes, Blocked until Global key selected, Next Step Guidance)。
- **Key Rotation Revoke Recovery** (`key-rotation-guide.tsx`): rotation steps (Generate replacement / Export trust config update / Switch managed Agent selection / Health verification before revoke), risk operations (Emergency Revoke / Break-glass Recovery / ADMIN_OPERATOR / Dashboard API Wrangler / Recovery key outside Client store)。
- **Connected Happy Path**: Health Check 成功後の selected-Agent route revalidate を `agent-health.ts` で実装済み。Overview/Threads/Events/Runs/Schedules/Integrations/Settings は既存 server-only Agent RPC real-data 経路を継承。

## 変更 copy (presentation-facing)

- Disable/Delete 警告 Alert: "Disable and delete require a trust config update" + revoked export 手順 + Trust Config Export 導線。
- Delete button label: "Delete (revoke in trust config)"。
- disabled/deleted key 注記: "Client status {status} can only be exported as revoked."。

## 結論

新規 presentation-facing UI は wireframe 正本に従い、PRODUCT.md の design principle (Local primitives, shared grammar / Secrets stay server-side / Operational clarity) と Impeccable/design-audit gate を満たす。global palette は既存 design system のもので本変更 scope 外。
