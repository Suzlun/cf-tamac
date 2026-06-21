/**
 * Integration installation foundation status values.
 */
export const integrationInstallationStatuses = [
  'installing',
  'active',
  'disabled',
  'uninstalled',
] as const;

/**
 * Integration installation status value.
 */
export type IntegrationInstallationStatus = (typeof integrationInstallationStatuses)[number];
