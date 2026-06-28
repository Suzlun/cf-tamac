## Why

GitHub issue #7 で示された Management Client UI は、リリース判断に耐える情報設計と視覚品質に達していない。特に table 偏重、Agent 選択前後の文脈混在、global navigation と selected-Agent navigation の未分離、Shadcn UI component のローカル利用可能範囲不足、Shadcn default token から逸脱する ad-hoc CSS が、管理者にとって「どの Agent を見ているのか」「どの操作が全体設定なのか」を判別しにくくしている。

この変更は、issue #7 の reference screenshot に着想を得た新しい wireframe から Management Client を再設計し、Client UI の設計品質、Agent scope の明確さ、credential/RPC secrecy boundary を同時に満たすための OpenSpec 契約を追加・更新する。

## What Changes

- **BREAKING**: Management Client navigation は左 side menu に統一し、global navigation と selected-Agent navigation を分離する。global navigation は `Agents` と `Global Settings` のみを表示する。
- **BREAKING**: selected-Agent navigation は Agent 選択後だけ有効になり、`Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を selected Agent scope の画面として表示する。
- `Agents` screen は Agent 一覧、Agent 登録、Agent 選択を扱う開始点になる。`New Agent` は standalone side-menu item ではなく、`Agents` screen 内の action として扱う。
- `Global Settings` は Client-wide settings だけを扱う。Cross-Agent UI は `Agents` と `Global Settings` に限定する。
- Agent scoped screens は table 偏重を避け、card/list/detail compositions を使って API、credential、model policy、schedules、integrations、settings contexts を読みやすく整理する。
- `Tools` と `Compactions` は standalone top-level menu として扱わず、必要な情報を `Runs`、`Events`、`Threads`、`Overview`、`Settings` などの文脈内 detail として表示する。
- Management Client design system は official Shadcn UI components を project components area に download/materialize し、実装時に全 official component を local component として利用可能にする。
- CSS design は Shadcn default styling/design tokens だけを使用し、Shadcn default から逸脱する strange/ad-hoc/extra CSS を残さない。

## Spec Units

### New Spec Units

- `client-design-system`: Management Client の local Shadcn component availability、Shadcn default token/styling 境界、visual quality/accessibility verification を扱う。New。Security cross-cutting concern として browser bundle に Agent credential/RPC seam を露出しない UI component usage を維持する。

### Modified Spec Units

- `management-client-shell`: Management Client の navigation shell、global/selected-Agent scope separation、left side menu、no-proxy/credential secrecy boundary を更新する。Modified。
- `agent-management-ui`: Agent list/registration/selection、selected-Agent overview/detail sections、card/list/detail information architecture、Agent-scoped API/credential/model policy/schedule/integration/settings contexts を更新する。Modified。

## Naming

- `client-design-system` の Scenario ID prefix は `CLIENT-DESIGN-SYSTEM` を使用する。
- `management-client-shell` の既存 Scenario ID prefix は `MANAGEMENT-CLIENT-SHELL` を維持する。
- `agent-management-ui` の既存 Scenario ID prefix は `AGENT-MANAGEMENT-UI` を維持する。
- Client component/design-system responsibility と Agent management screen responsibility は、`client-design-system` と `agent-management-ui` として分けて扱う。

## Impact

- Impacted package area: `packages/client` Management Client UI、App Router shell、Client-only component area、Client-side visual styling conventions。
- Impacted specs: `management-client-shell`、`agent-management-ui`、new `client-design-system`。
- Security impact: Browser bundles must continue to exclude Agent credentials, direct Agent RPC invocation logic, Agent runtime imports, and public Agent API proxy routes.
- Data/API impact: Agent Service TypeSpec/proto/RPC contract change is not expected for this UI redesign; Management Client remains a server-side Agent RPC consumer.
- Verification impact: Management Client tests must reference changed Scenario IDs, cover navigation/scope behavior, Shadcn component materialization, Shadcn default token usage, responsive behavior, accessibility, and visual quality gates.
