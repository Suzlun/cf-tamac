# client-design-system Specification

## Purpose

Management Client design system は、Shadcn UI のローカル component source、既定 token、responsive/focus interaction、browser secrecy boundary を定義し、画面ごとの場当たりな UI 実装と Agent credential 露出を防ぐ。

## Requirements

### Requirement: Local Shadcn component source availability

Management Client design system は、Shadcn UI 公式コンポーネントを Client component 領域に編集可能なローカルソースとして保持 SHALL。

**Customer Context**

Management Client 管理者は、画面ごとに必要な UI primitive が欠けるたびに場当たりの component や CSS を追加されると、見た目、アクセシビリティ、操作感が画面間でばらつく。開発者は Shadcn UI の公式 component source を repository 内で確認、編集、review でき、実行時に remote registry availability へ依存しない状態を必要としている。

**Requirement**

`packages/client` は、Shadcn UI 公式 component registry の全 component entry を `packages/client/src/components/ui/**` 配下の編集可能な TSX source として materialize SHALL。

Materialized component は `packages/client/components.json` の `style`、`baseColor`、`cssVariables`、`iconLibrary`、aliases に従う MUST。

Management Client UI は Shadcn component を runtime remote registry、runtime remote component package、または remote code loading から consume して MUST NOT。

Application composition は local Shadcn component source と project-local wrapper/composition だけを import SHALL。

Component inventory は implementation が検査できる形で repository に保持 SHALL。

#### Scenario: Official Shadcn components are available as local source (CLIENT-DESIGN-SYSTEM-S001)

- **GIVEN** Shadcn component inventory と `packages/client/components.json` を検査できる
- **WHEN** `packages/client/src/components/ui/**` の component files と imports を列挙する
- **THEN** official component inventory の全 entry は編集可能な local TSX source として存在する
- **AND** Management Client composition は those components を project-local import path から consume する
- **AND** runtime は Shadcn registry または remote component package から component source を取得しない

### Requirement: Shadcn default token styling boundary

Management Client visual styling は Shadcn default design token と official component styling だけを styling source として使用 SHALL。

**Customer Context**

管理者は同じ Management Client 内で画面ごとに色、余白、字体、focus ring、状態表現が変わると、重要な Agent 操作や警告を見落としやすくなる。開発者は product 固有の extra CSS に頼らず、Shadcn default token と component variant を使って一貫した画面を構成する必要がある。

**Requirement**

`packages/client/app/globals.css` は Shadcn default token block、Tailwind directives、Shadcn が要求する base layer だけを保持 SHALL。

`packages/client/tailwind.config.ts` は Shadcn default semantic slots と repository content path を設定 SHALL。

Management Client visual style は Shadcn default CSS variables、Tailwind utility classes、official component variants だけを使用 MUST。

Product-specific global palette variables、route-specific visual shim classes、bespoke gradients、custom font overrides、table-only responsive CSS shims、and extra design token aliases は Management Client visual styling source として残して MUST NOT。

#### Scenario: Styling uses only Shadcn default tokens (CLIENT-DESIGN-SYSTEM-S002)

- **GIVEN** `packages/client/app/globals.css`、`packages/client/tailwind.config.ts`、and Management Client component source を検査できる
- **WHEN** CSS variables、Tailwind theme extensions、global selectors、and component class names を scan する
- **THEN** styling source は Shadcn default token names、Tailwind utilities、and official component variants に限定される
- **AND** product-specific palette variables、route-specific visual shim classes、bespoke gradients、custom font overrides、and table-only responsive CSS shims は styling source として使われない

### Requirement: Accessible responsive Shadcn interaction states

Management Client design system は、Shadcn primitives を用いて responsive navigation、focus management、motion preference、and observable UI states を一貫して提供 SHALL。

**Customer Context**

管理者は desktop だけでなく narrow viewport、keyboard、screen reader、reduced-motion preference でも Agent 管理操作を安全に行う必要がある。状態表示が screen ごとに異なると、保存中、検証エラー、権限不足、RPC failure を見落とす危険がある。

**Requirement**

Management Client UI は loading、empty、success、error、validation、disabled、pending、permission-denied states を Shadcn components and accessible attributes で表示 SHALL。

Left side navigation は desktop では persistent sidebar として表示 SHALL。Narrow viewport では Shadcn `Sheet` または equivalent local Shadcn component によって open/close、focus trap、Escape close、focus return を提供 SHALL。

Detail surfaces は card/list/detail composition を使用 SHALL。Narrow viewport では detail content を `Sheet`、`Dialog`、or `Drawer` equivalent local Shadcn component で表示 SHALL。

Motion は `prefers-reduced-motion` を尊重 SHALL。Status は color alone に依存して MUST NOT。

#### Scenario: Responsive shell and states preserve accessibility (CLIENT-DESIGN-SYSTEM-S003)

- **GIVEN** Management Client UI を desktop、narrow viewport、keyboard、and reduced-motion preference で操作できる
- **WHEN** sidebar、detail surface、form validation、loading、pending、error、and permission-denied states を操作する
- **THEN** navigation and detail surfaces は focus trap、Escape close、focus return、visible focus ring、and landmark semantics を提供する
- **AND** loading and pending indicators は reduced-motion preference を尊重する
- **AND** status and validation messages は text label and accessible association を持つ

### Requirement: Design-system browser secrecy boundary

Management Client design-system components は presentation boundary に閉じ、Agent RPC、credential resolution、and server-only code seams を browser-visible component layer へ持ち込んで MUST NOT。

**Customer Context**

Shadcn component を増やしても、component 層が Agent credential や server-only Agent RPC factory を import すると、UI の見た目改善が security regression になる。管理者は UI component を利用しても Agent credential が browser payload や bundle に含まれない保証を必要としている。

**Requirement**

`packages/client/src/components/**` and `packages/client/app/**` browser-visible modules は Agent credential material、credential reference resolution logic、direct Agent RPC invocation logic、Connect runtime construction、generated Agent RPC client construction、or Agent runtime imports を含んで MUST NOT。

Shadcn materialized components は presentation primitives と browser-safe props だけを扱う SHALL。

Agent RPC invocation は `packages/client/src/server/agent-rpc/**` and Server Components/Server Actions の server-side execution に限定 SHALL。

Shadcn component materialization は Agent Worker への client-side fetch、public Agent API proxy route、or arbitrary RPC forwarding route を導入して MUST NOT。

#### Scenario: UI component layer does not expose Agent RPC seams (CLIENT-DESIGN-SYSTEM-S004)

- **GIVEN** browser-visible Management Client modules、local Shadcn components、and bundled output を検査できる
- **WHEN** Agent credential strings、server-only Agent RPC factory imports、Connect runtime construction、generated Agent RPC client construction、Agent runtime imports、and client-side Agent fetch calls を scan する
- **THEN** UI component layer and browser bundle は those seams を含まない
- **AND** Agent RPC invocation remains reachable only from server-side Client modules
