/**
 * Management Client sidebar navigation の source-of-truth 設定（純粋データ、JSX なし）。
 *
 * タスク 2.2 / 2.4 / 2.7: global navigation は `Agents` と `Global Settings` のみ、
 * selected-Agent navigation は `Overview`〜`Settings` のみを公開する。
 * 旧 `Registry`/`New`/`Compactions`/`Tools` の standalone section label は廃止し、
 * Tools と Compaction は文脈 detail として各画面内で扱う。
 * JSX を含まないため `.ts` テストからも安全に import できる。
 */

/** global scope で常時表示する navigation 項目。 */
export interface GlobalNavItem {
  readonly slug: string;
  readonly label: string;
  readonly href: string;
}

/** global scope で常時表示する navigation 項目（Agents と Global Settings のみ）。 */
export const GLOBAL_NAV_ITEMS: readonly GlobalNavItem[] = [
  { slug: 'agents', label: 'Agents', href: '/agents' },
  { slug: 'global-settings', label: 'Global Settings', href: '/global-settings' },
];

/** selected-Agent scope で表示する navigation 項目（Tools/Compactions は含まない）。 */
export interface AgentSectionNavItem {
  readonly slug: string;
  readonly label: string;
  readonly segment: string;
}

/** selected-Agent scope で表示する navigation 項目（Overview〜Settings、Tools/Compactions 単独項目なし）。 */
export const AGENT_SECTION_NAV_ITEMS: readonly AgentSectionNavItem[] = [
  { slug: 'overview', label: 'Overview', segment: '' },
  { slug: 'threads', label: 'Threads', segment: 'threads' },
  { slug: 'events', label: 'Events', segment: 'events' },
  { slug: 'runs', label: 'Runs', segment: 'runs' },
  { slug: 'schedules', label: 'Schedules', segment: 'schedules' },
  { slug: 'integrations', label: 'Integrations', segment: 'integrations' },
  { slug: 'settings', label: 'Settings', segment: 'settings' },
];

/** supported な management route graph（route graph test の positive 期待値）。 */
export const SUPPORTED_MANAGEMENT_ROUTES: readonly string[] = [
  '/',
  '/agents',
  '/agents/new',
  '/global-settings',
  '/global-settings/signing-keys',
  '/global-settings/trust-config-export',
  '/global-settings/key-rotation',
  '/agents/:agentId',
  '/agents/:agentId/threads',
  '/agents/:agentId/events',
  '/agents/:agentId/runs',
  '/agents/:agentId/schedules',
  '/agents/:agentId/integrations',
  '/agents/:agentId/settings',
];

/**
 * Global Settings 配下の Client-wide route 一覧 (Agent 0 件でも到達可能)。
 *
 * @remarks signing key lifecycle / trust config export / rotation guidance は Client-wide 操作で、
 * Agent scoped ではないため global scope の nav / route graph に含める。
 */
export const GLOBAL_SETTINGS_CHILD_ROUTES: readonly string[] = [
  '/global-settings/signing-keys',
  '/global-settings/trust-config-export',
  '/global-settings/key-rotation',
];

/**
 * selected-Agent section の絶対 href を組み立てる。
 *
 * @param agentId - 選択中 Agent の ID。
 * @param segment - section segment（Overview は空文字）。
 * @returns `/agents/{agentId}` または `/agents/{agentId}/{segment}`。
 */
export function buildAgentSectionHref(agentId: string, segment: string): string {
  return segment === '' ? `/agents/${agentId}` : `/agents/${agentId}/${segment}`;
}
