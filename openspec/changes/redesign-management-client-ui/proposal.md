## Why

Management Client の現行 UI は、Agent を本番運用する管理者が状況把握・登録・選択・監督を迷わず行える情報設計になっていない。release-ready な管理体験にするには、実装前に左サイドバー中心の navigation、selected Agent context、card/summary 主体の画面構成、状態設計、accessibility を明確にした wireframe と product contract が必要である。

この変更は、GitHub Issue #7 の「本番品質の Management Client UI へ再設計する」要求を、professional な UI/UX proposal と OpenSpec contract に落とし込む。参考 design は方向性の inspiration として扱い、table-heavy な一覧に偏らず、Agent の状態・Thread/Event/Run/Schedule/Integration を理解しやすい summary/card-first experience を定義する。

## What Changes

- Management Client の navigation を、global area と selected-Agent area に分離する。
- Global area は `Agents` と `Global Settings` だけを表示し、cross-Agent UI はこの 2 画面に限定する。
- Selected-Agent area は、選択中 Agent に対する `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を左サイドバーで表示する。
- Agent 未選択時は selected-Agent menu を hidden または disabled にし、Agent selection guidance を表示する。
- `New Agent` は独立 side-menu item ではなく、`Agents` screen 内の action として扱う。
- `Tools` と `Compactions` は独立 top-level menu にせず、Runs、Events、Threads、Overview、Settings など Agent-scoped context の detail/metadata として扱う。
- Desktop と mobile の responsive shell、empty/loading/error/permission states、keyboard/focus behavior、secret-safe error copy を UI contract に含める。
- Management Client の server/browser boundary、Client-owned D1、server-only Agent RPC、no-proxy route、Protobuf RPC-only Agent surface は維持する。

## Spec Units

### New Spec Units

None.

### Modified Spec Units

- `management-client`: Management Client の route shell、navigation IA、browser secrecy、no-proxy 境界、global/selected-Agent sidebar behavior を更新する。Security concern: Browser bundle に Agent credential、direct Agent RPC invocation、Agent proxy route を入れない。
- `client-management`: Agent list/registration/selection、Agent-scoped Overview/Threads/Events/Runs/Schedules/Integrations/Settings の UX contract、card/summary-first presentation、states/accessibility/test coverage を更新する。Security concern: Agent domain snapshots は Client D1 に保存せず、必要な Agent-owned data は server-side Agent RPC から取得する。

## Naming

Scenario ID prefixes:

- `management-client` uses `MANAGEMENT-CLIENT-S###`.
- `client-management` uses `CLIENT-MANAGEMENT-S###`.

Related responsibilities stay split: `management-client` covers the shell, navigation, route/public boundary, and browser secrecy; `client-management` covers the management workflows and Agent-scoped screen behavior.

## Impact

- Impacted package after approval: `packages/client/**` Management Client route shells, Server Components, Server Actions, server-only Client D1 repositories, and server-only generated Agent RPC usage.
- OpenSpec contract impact: modified delta specs under `management-client` and `client-management`, plus implementation-ready tasks and wireframe/design artifacts.
- Agent API impact: no REST/OpenAPI/Orval Agent surface is introduced; Agent Worker remains Protobuf RPC-only.
- Data impact: Client D1 remains limited to managed Agent records, credential references, and safe Client-owned UI metadata; Agent domain snapshots stay Agent-owned.
- Security impact: Browser secrecy, no direct Agent RPC, no Client Agent proxy route, and secret-safe UI copy become explicit acceptance criteria.
- UX impact: desktop/mobile layout, card/summary-first information architecture, empty/loading/error/disabled states, Agent selection state, and accessibility are specified before implementation.
