/**
 * Integration installation を Agent-owned storage で管理する status 一覧です。
 *
 * @remarks
 * install 中、active、disabled、uninstalled の lifecycle だけを表します。Provider delivery status や
 * Adapter connection status は別の状態型で扱い、installation の意味を膨らませません。
 */
export const integrationInstallationStatuses = [
  'installing',
  'active',
  'disabled',
  'uninstalled',
] as const;

/**
 * Integration installation status の union 型です。
 *
 * @remarks
 * `integrationInstallationStatuses` から導出し、repository と domain operation の status 値を一致させます。
 */
export type IntegrationInstallationStatus = (typeof integrationInstallationStatuses)[number];
