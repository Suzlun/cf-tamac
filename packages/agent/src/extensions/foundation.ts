/**
 * Extension installation foundation status values.
 */
export const extensionInstallationStatuses = [
  'installing',
  'active',
  'disabled',
  'uninstalled',
] as const;

/**
 * Extension installation status value.
 */
export type ExtensionInstallationStatus = (typeof extensionInstallationStatuses)[number];
