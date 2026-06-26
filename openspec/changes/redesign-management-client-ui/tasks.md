## 1. OpenSpec と UI 契約の入力

- [ ] 1.1 `proposal.md`、`design.md`、`specs/management-client-shell/spec.md`、`specs/agent-management-ui/spec.md`、`wireframes/*.md` を読む。`/` から `/agents` への遷移、`/settings`、Agents 画面内登録、選択中 Agent の左サイドバー、Agent 文脈の Tool/Compaction 詳細配置を実装契約点として固定する。
- [ ] 1.2 実装 branch が `packages/agent/src/typespec/**`、`packages/agent/proto/**`、`packages/agent/src/generated/rpc/**`、`packages/client/src/generated/agent-rpc/**` を編集しないことを確認する。この変更による Agent API 影響はゼロに保つ。
- [ ] 1.3 `wireframes/00-shadcn-full-copy-contract.md` を読み、公式 shadcn/ui 全コピーを画面別 UI 実装前の必須入力として扱う。
- [ ] 1.4 公式 core registry（`https://ui.shadcn.com/r/index.json`）、公式 docs components、公式 Blocks、公式 Charts を取得し、すべての公式 item をローカルソースへコピーする repository script または test helper を追加する。
- [ ] 1.5 公式 core `registry:ui` files は `packages/client/src/components/ui/**` へ、公式 Blocks は `packages/client/src/components/shadcn-blocks/**` のような route ではないローカルソースへ、公式 Charts は `packages/client/src/components/shadcn-charts/**` へコピーする。公式 shadcn/ui item を manifest だけの entry として残さない。
- [ ] 1.6 `packages/client/src/components/ui/shadcn-registry-copy.generated.json` または同等 manifest を生成し、公式コピー済み item ごとに `source`、`namespace`、`name`、`type`、`sourceUrl`、`files`、`localPath`、`dependencies`、`registryDependencies`、`copyStatus`、`blocker` を記録する。
- [ ] 1.7 copy manifest が source ごとの件数を含み、公式 core registry items、docs-only component recipes、公式 Blocks、公式 Charts を捕捉していることを確認する。公式 item が一覧化だけでローカルコピーまたは生成をされていない場合は失敗させる。
- [ ] 1.8 Registry Directory（`https://ui.shadcn.com/r/registries.json`）は third-party registry metadata としてだけ取得する。entry は外部候補として分離記録し、明示的な review/approval なしに third-party registry code を install しない。

## 2. Route Shell とナビゲーション

- [ ] 2.1 `packages/client/app/page.tsx` を更新し、`/` が `/agents` へ redirect するようにする。root entry が Agent registry flow を開くことを確認する。
- [ ] 2.2 `packages/client/app/layout.tsx` を更新し、shadcn `Sidebar`/`Sheet`、Topbar、skip link、左サイドバー slot、`<main id="main-content">` を持つ `packages/client/src/components/management-shell.tsx` を追加する。
- [ ] 2.3 `packages/client/src/components/sidebar-navigation.tsx` を追加する。shadcn `Sidebar`、`ScrollArea`、`Separator`、`Button`、`Badge`、`Tooltip` を使い、全体領域（`Agents`、`Global Settings`）と選択中 Agent 領域（`Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings`）および Agent 未選択ガイダンス状態を提供する。
- [ ] 2.4 `packages/client/app/agents/[agentId]/layout.tsx` を追加し、登録済み Agent metadata をサーバー側で解決する。credential をブラウザ props に露出せず、選択中 Agent のナビゲーションを提供する。
- [ ] 2.5 `packages/client/src/components/section-nav.tsx` を削除し、route shell から `ControlRoomFrame` の横ナビゲーションと視覚 chrome 利用を取り除く。残る構造 helper は shadcn コンポーネント合成でなければならず、独自視覚 CSS であってはならない。
- [ ] 2.6 `packages/client/app/settings/page.tsx` を追加し、Global Settings ではブラウザに渡して安全な Client-wide runtime/config/status と表示設定だけを扱う。

## 3. Agents 画面と登録フロー

- [ ] 3.1 `packages/client/app/agents/page.tsx` を更新し、shadcn `Card`/`Badge`/`Button`/`Input` を基礎にした Agent registry、検索・絞り込みの空状態、pin grouping、credential status hint、Agent selection action を描画する。
- [ ] 3.2 `packages/client/src/components/agent-card.tsx` を追加し、`packages/client/src/components/agent-list.tsx` を更新する。Agent status は色だけでなく shadcn `Badge`、lucide icon、text label で表す。
- [ ] 3.3 Agent registration flow を `packages/client/app/agents/new/page.tsx` から `/agents` へ移し、Server Actions に支えられた shadcn `Dialog` または `Sheet` として扱う。
- [ ] 3.4 Agent registration の独立 route code を削除しつつ、登録フローは `Agents` 画面の action から利用できる状態にする。
- [ ] 3.5 `packages/client/src/server/actions/managed-agents.ts` を更新して `selectManagedAgent` を提供し、Client D1 repository behavior を重複させずに既存の last-opened/pin/registration logic を再利用する。

## 4. 選択中 Agent 画面とメタデータ配置

- [ ] 4.1 `packages/client/app/agents/[agentId]/page.tsx` の Overview を更新し、lifecycle/config/credential/model-policy summaries、approval queue、recent activity、Compaction summary を持つカード・要約優先 layout を使う。
- [ ] 4.2 `packages/client/app/agents/[agentId]/threads/page.tsx` を更新し、Thread detail が Thread context 内で Memory/Compaction metadata を含むようにする。
- [ ] 4.3 `packages/client/app/agents/[agentId]/events/page.tsx` を更新し、Events を因果 link と ToolInvocation 由来 event metadata を持つ timeline/cards として描画する。
- [ ] 4.4 `packages/client/app/agents/[agentId]/runs/page.tsx` を更新し、Runs detail が Tool execution と Tool approval sections を含むようにする。
- [ ] 4.5 `packages/client/app/agents/[agentId]/schedules/page.tsx` を更新し、Schedule cards、作成・取消状態、overlap policy、秘匿情報を漏らさない error を描画する。
- [ ] 4.6 `packages/client/app/agents/[agentId]/integrations/page.tsx` を更新し、Integration detail が Tool catalog と setup/cleanup status を含むようにする。
- [ ] 4.7 `packages/client/app/agents/[agentId]/settings/page.tsx` を更新し、Agent API、credential、model policy、settings sections を Agent 文脈に限定し、秘匿情報を漏らさない。
- [ ] 4.8 `packages/client/app/agents/[agentId]/tools/page.tsx` を削除し、再利用可能な Tool UI を Runs、Events、Integrations、Overview、Settings のいずれかへ統合する。
- [ ] 4.9 `packages/client/app/agents/[agentId]/compactions/page.tsx` を削除し、再利用可能な Compaction UI を Overview または Threads detail へ統合する。
- [ ] 4.10 `packages/client/src/components/tool-view.tsx` と `packages/client/src/components/compaction-view.tsx` を更新し、明示的な Agent 文脈 detail props から描画する。

## 5. ブラウザ境界、Client D1 境界、共通状態

- [ ] 5.1 新しい shell、sidebar、card、registration、Agent 文脈 components に対し、ブラウザ可視 import 禁止対象を監査する。禁止対象は generated Agent RPC、Connect runtime、server-only Agent RPC factories、`CLIENT_DB`、credential refs、`Authorization`、`Bearer` とする。
- [ ] 5.2 Agent RPC 呼び出しは Server Components、Server Actions、または `packages/client/src/server/agent-rpc/**` 内に限定する。その server-only RPC directory 配下の各 file が引き続き `import 'server-only';` で始まることを確認する。
- [ ] 5.3 Client D1 writes は managed Agent records と credential references に限定する。Agent-domain snapshot table、repository write、cached Agent-domain state が追加されていないことを確認する。
- [ ] 5.4 loading、empty、error、permission-denied、disabled、pending、filter-empty、selected-agent-required states は shadcn `Skeleton`、`Empty`、`Alert`、`Tooltip`、`Progress`、`Dialog`/`Sheet` と `wireframes/11-states-copy-a11y.md` の文言 guidance を使って実装する。
- [ ] 5.5 skip link、focus-visible behavior、`aria-current`、disabled reason labels/tooltips、dialog focus trap、`prefers-reduced-motion` の shared accessible state components を追加または更新する。該当箇所では shadcn local components を使う。
- [ ] 5.6 `packages/client/app/globals.css` を Tailwind directives と shadcn/ui CSS variables / base layer に縮小する。custom visual classes、custom keyframes、custom gradients、control-room styling を削除する。
- [ ] 5.7 `packages/client/tailwind.config.ts` から custom control-room color aliases と bespoke typography を削除する。shadcn semantic tokens は `components.json` の `new-york` / `neutral` / CSS variables と揃える。

## 6. Scenario ID で覆う自動テスト

- [ ] 6.1 `/agents`、registration action、selected-Agent guidance state を覆う `[MANAGEMENT-CLIENT-SHELL-S001] Agent registry shell renders for a browser user` という title の test を `packages/client/src/tests/management-navigation.test.tsx` に追加または更新する。
- [ ] 6.2 redesigned shell と card components を覆う `[MANAGEMENT-CLIENT-SHELL-S002] Browser bundles do not call Agent RPC directly` という title の test を `packages/client/src/tests/browser-agent-rpc-secrecy.test.ts` に追加または更新する。
- [ ] 6.3 Global area と Agent-unselected state を覆う `[MANAGEMENT-CLIENT-SHELL-S009] Left sidebar separates global and selected-Agent navigation` という title の test を `packages/client/src/tests/management-navigation.test.tsx` に追加または更新する。
- [ ] 6.4 7 つの selected-Agent items と Topbar selected-Agent display を覆う `[MANAGEMENT-CLIENT-SHELL-S010] Selected-Agent area activates for registered Agent context` という title の test を `packages/client/src/tests/management-navigation.test.tsx` に追加または更新する。
- [ ] 6.5 public Agent API proxy security boundary を覆う `[MANAGEMENT-CLIENT-SHELL-S008] Client exposes no Agent API proxy routes` という title の test を `packages/client/src/tests/client-api-proxy-absence.test.ts` に追加または更新する。
- [ ] 6.6 `/` redirect behavior と Agent registry guidance を覆う `[MANAGEMENT-CLIENT-SHELL-S001] Root entry opens the Agent registry shell` という title の test を `packages/client/src/tests/management-navigation.test.tsx` に追加または更新する。
- [ ] 6.7 card-first pinned ordering と last-opened update を覆う `[AGENT-MANAGEMENT-UI-S001] Agent list が registry 表示と並び順を支援する` という title の test を `packages/client/src/tests/agent-registry-shell.test.tsx` または `management-navigation.test.tsx` に追加または更新する。
- [ ] 6.8 in-page registration validation と accessible error linkage を覆う `[AGENT-MANAGEMENT-UI-S002] Add Agent フォームが connection メタデータをアクセシブルに検証する` という title の test を `packages/client/src/tests/agent-registry-shell.test.tsx` に追加または更新する。
- [ ] 6.9 registration action、selection action、status labels を覆う `[AGENT-MANAGEMENT-UI-S010] Agents screen owns Agent registration and selection` という title の test を `packages/client/src/tests/agent-registry-shell.test.tsx` に追加または更新する。
- [ ] 6.10 Agent-scoped routes と selected-agent-required state を覆う `[AGENT-MANAGEMENT-UI-S011] Selected-Agent screens activate only for selected Agent` という title の test を `packages/client/src/tests/management-navigation.test.tsx` に追加または更新する。
- [ ] 6.11 Overview/Threads/Runs/Integrations/Settings の Tool/Compaction metadata を覆う `[AGENT-MANAGEMENT-UI-S012] Tools and Compactions are shown inside Agent-scoped context` という title の test を `packages/client/src/tests/management-navigation.test.tsx` または専用 component tests に追加または更新する。
- [ ] 6.12 `/settings` content と Agent-specific data absence を覆う `[AGENT-MANAGEMENT-UI-S013] Global Settings handles only Client-wide settings` という title の test を `packages/client/src/tests/management-navigation.test.tsx` に追加または更新する。
- [ ] 6.13 Agent-domain snapshot table と repository write がないことを覆う `[AGENT-MANAGEMENT-UI-S013] Client D1 remains limited to management metadata` という title の tests を `packages/client/src/tests/client-d1-schema.test.ts` と `client-repository-boundary.test.ts` に追加または更新する。
- [ ] 6.14 loading/empty/error/disabled/pending states と secret-safe copy を覆う `[AGENT-MANAGEMENT-UI-S014] Screens expose actionable states without leaking secrets` という title の component tests を追加または更新する。
- [ ] 6.15 server-side Agent RPC reads と Client D1 に Agent-owned history を永続化しないことを覆う `[AGENT-MANAGEMENT-UI-S005] Thread Event Run と Compaction views が Agent-owned history を表示する` という title の test を `packages/client/src/tests/client-repository-boundary.test.ts` に追加または更新する。
- [ ] 6.16 copied shadcn local source の shell 利用、copy manifest 参照、custom shell CSS removal を覆う `[MANAGEMENT-CLIENT-SHELL-S011] Shell uses shadcn/ui components and default theme` という title の tests を追加または更新する。
- [ ] 6.17 generated copy manifest の存在、source ごとの件数、required fields、official item local paths、manifest-only official items の不存在、local shadcn component imports、control-room CSS tokens/classes の削除を覆う `[AGENT-MANAGEMENT-UI-S019] Screens use copied shadcn/ui source without custom CSS` という title の tests を追加または更新する。

## 7. 検証とレビュー

- [ ] 7.1 artifacts 更新後、implementation review 前に `openspec validate --type change "redesign-management-client-ui" --strict --no-interactive` を実行する。
- [ ] 7.2 `pnpm lint` を実行し、OpenSpec、ESLint、governance、scenario coverage、supply-chain の失敗を lint bypass なしで修正する。
- [ ] 7.3 `pnpm check:client` を実行し、`packages/client` の型と境界の問題を修正する。
- [ ] 7.4 `pnpm test:client` を実行し、新規または更新された automated test title が対応する bracketed Scenario ID を含むことを確認する。
- [ ] 7.5 `pnpm build` を実行し、Management Client build と browser bundle boundary を検証する。
- [ ] 7.6 `pnpm check:codegen` を実行し、Agent proto/RPC generated outputs に drift がないことを証明する。
- [ ] 7.7 `wireframes/*.md` に対する UI fidelity について `unit/client/designer` review を依頼し、その後 touched paths、Scenario ID tests、command results を添えて `unit/client/reviewer` approval を依頼する。
- [ ] 7.8 実装報告に shadcn copy manifest の source ごとの件数、コピー先 path、copy-blocked blocker を含める。公式 shadcn/ui item が一覧化だけでローカルコピーまたは生成されていない場合、reviewer は変更を reject する。
