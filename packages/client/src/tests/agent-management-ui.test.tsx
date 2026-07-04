import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildDestroyConfirmSchema } from '../components/schemas/agent-settings';

const agentListPath = new URL('../components/agent-list.tsx', import.meta.url);
const registrationFormPath = new URL('../components/agent-registration-form.tsx', import.meta.url);
const registrationActionsPath = new URL(
  '../components/agent-registration-actions.tsx',
  import.meta.url
);
const modelPolicyFieldsPath = new URL('../components/model-policy-fields.tsx', import.meta.url);
const modelPolicySummaryPath = new URL('../components/model-policy-summary.tsx', import.meta.url);
const modelPolicySettingsSectionPath = new URL(
  '../components/model-policy-settings-section.tsx',
  import.meta.url
);
const registrationSchemaPath = new URL(
  '../components/schemas/agent-registration.ts',
  import.meta.url
);
const modelPolicySchemaPath = new URL('../components/schemas/model-policy.ts', import.meta.url);
const dataTablePath = new URL('../components/data-table.tsx', import.meta.url);
const formFieldPath = new URL('../components/ui/form.tsx', import.meta.url);
const errorAlertPath = new URL('../components/error-alert.tsx', import.meta.url);
const signalBadgePath = new URL('../components/signal-badge.tsx', import.meta.url);
const emptyStatePath = new URL('../components/empty-state.tsx', import.meta.url);
const skeletonTablePath = new URL('../components/skeleton-table.tsx', import.meta.url);
const controlRoomFramePath = new URL('../components/control-room-frame.tsx', import.meta.url);
const managedAgentsPath = new URL('../server/actions/managed-agents.ts', import.meta.url);
const registrationActionPath = new URL(
  '../server/actions/managed-agent-registration.ts',
  import.meta.url
);
const agentsPagePath = new URL('../../app/agents/page.tsx', import.meta.url);
const newAgentPagePath = new URL('../../app/agents/new/page.tsx', import.meta.url);
const agentOverviewPagePath = new URL('../../app/agents/[agentId]/page.tsx', import.meta.url);
const agentSettingsPagePath = new URL(
  '../../app/agents/[agentId]/settings/page.tsx',
  import.meta.url
);
const agentLifecycleActionPath = new URL('../server/actions/agent-lifecycle.ts', import.meta.url);
const modelPolicyActionPath = new URL('../server/actions/model-policies.ts', import.meta.url);
const modelPolicyViewModelsPath = new URL(
  '../server/actions/model-policy-view-models.ts',
  import.meta.url
);
const settingsFormPath = new URL('../components/agent-settings-form.tsx', import.meta.url);
const configSectionPath = new URL('../components/agent-config-section.tsx', import.meta.url);
const settingsDangerZonePath = new URL('../components/settings-danger-zone.tsx', import.meta.url);
const credentialRotationPath = new URL(
  '../components/credential-rotation-section.tsx',
  import.meta.url
);
const settingsSchemaPath = new URL('../components/schemas/agent-settings.ts', import.meta.url);
const confirmDialogPath = new URL('../components/confirm-dialog.tsx', import.meta.url);
const detailDrawerPath = new URL('../components/detail-drawer.tsx', import.meta.url);
const threadListPath = new URL('../components/thread-list.tsx', import.meta.url);
const eventListPath = new URL('../components/event-list.tsx', import.meta.url);
const runListPath = new URL('../components/run-list.tsx', import.meta.url);
const compactionViewPath = new URL('../components/compaction-view.tsx', import.meta.url);
const scheduleListPath = new URL('../components/schedule-list.tsx', import.meta.url);
const scheduleCreateFormPath = new URL('../components/schedule-create-form.tsx', import.meta.url);
const scheduleCreateSchemaPath = new URL(
  '../components/schemas/schedule-create.ts',
  import.meta.url
);
const toolViewPath = new URL('../components/tool-view.tsx', import.meta.url);
const toolReviewContentPath = new URL('../components/tool-review-content.tsx', import.meta.url);
const integrationViewPath = new URL('../components/integration-view.tsx', import.meta.url);
const integrationPermissionControlsPath = new URL(
  '../components/integration-permission-controls.tsx',
  import.meta.url
);
const integrationInstallFormPath = new URL(
  '../components/integration-install-form.tsx',
  import.meta.url
);
const integrationInstallSchemaPath = new URL(
  '../components/schemas/integration-install.ts',
  import.meta.url
);
const integrationDetailPath = new URL(
  '../components/integration-installation-detail.tsx',
  import.meta.url
);
const integrationTablePath = new URL('../components/integration-table.tsx', import.meta.url);
const agentQueriesPath = new URL('../server/actions/agent-queries.ts', import.meta.url);
const agentOperationsPath = new URL('../server/actions/agent-operations.ts', import.meta.url);
const agentOperationViewModelsPath = new URL(
  '../server/actions/agent-operation-view-models.ts',
  import.meta.url
);
const agentThreadsPagePath = new URL(
  '../../app/agents/[agentId]/threads/page.tsx',
  import.meta.url
);
const agentEventsPagePath = new URL('../../app/agents/[agentId]/events/page.tsx', import.meta.url);
const agentRunsPagePath = new URL('../../app/agents/[agentId]/runs/page.tsx', import.meta.url);
// タスク 2.6/3.5: standalone compactions route は廃止。Compaction context は threads 画面の文脈 detail。
const agentCompactionsPagePath = new URL(
  '../../app/agents/[agentId]/threads/page.tsx',
  import.meta.url
);
const agentSchedulesPagePath = new URL(
  '../../app/agents/[agentId]/schedules/page.tsx',
  import.meta.url
);
// タスク 2.6/3.7: standalone tools route は廃止。Tool approval context は runs 画面の文脈 detail。
const agentToolsPagePath = new URL('../../app/agents/[agentId]/runs/page.tsx', import.meta.url);
const agentIntegrationsPagePath = new URL(
  '../../app/agents/[agentId]/integrations/page.tsx',
  import.meta.url
);

function read(filePath: URL): string {
  return readFileSync(fileURLToPath(filePath.href), 'utf8');
}

describe('Agent list page (AGENT-MANAGEMENT-UI-S001)', () => {
  it('[AGENT-MANAGEMENT-UI-S001] Agent list displays registry fields from browser-safe data', () => {
    const agentList = read(agentListPath);
    const agentsPage = read(agentsPagePath);
    const managedAgents = read(managedAgentsPath);

    // The list page reads from the browser-safe registry action.
    expect(agentsPage).toContain('listManagedAgentsWithCredentialStatus');
    expect(agentsPage).toContain('markManagedAgentOpened');
    expect(agentsPage).toContain('setManagedAgentPinned');

    // The list component displays all required fields per wireframe §6.1.
    expect(agentList).toContain('displayName');
    expect(agentList).toContain('agentId');
    expect(agentList).toContain('agentRpcOrigin');
    expect(agentList).toContain('pinned');
    expect(agentList).toContain('displayOrder');
    expect(agentList).toContain('lastOpenedAtMs');
    expect(agentList).toContain('credentialStatus');
    expect(agentList).toContain('Connection');
    expect(agentList).toContain('Registry only');

    // タスク 3.1: list は table 偏重ではなく card/list composition を使う。
    expect(agentList).toContain('Card');
    expect(agentList).toContain('Sort by');

    // The list uses shadcn-style components, not bespoke low-level semantics.
    expect(agentList).toContain('ControlRoomFrame');
    expect(agentList).toContain('EmptyState');
    expect(agentList).toContain('SignalBadge');
    expect(agentList).toContain('Button');

    // Pin toggle uses aria-pressed and aria-label.
    expect(agentList).toContain('aria-pressed');
    expect(agentList).toContain('aria-label');

    // Opening an Agent calls the server-side markManagedAgentOpened action.
    expect(agentList).toContain('onOpen');
    expect(managedAgents).toContain('markManagedAgentOpened');

    // The server action returns browser-safe data (no credentialRef, no publicFingerprint in the hint).
    expect(managedAgents).toContain('ManagedAgentCredentialHint');
    // The ManagedAgentCredentialHint interface should not include secret lookup fields.
    const hintInterfaceMatch = /export interface ManagedAgentCredentialHint {[^}]+}/.exec(
      managedAgents
    );
    expect(hintInterfaceMatch).not.toBeNull();
    const hintInterface = hintInterfaceMatch?.[0] ?? '';
    expect(hintInterface).not.toContain('credentialRef');
    expect(hintInterface).not.toContain('publicFingerprint');
  });

  it('[AGENT-MANAGEMENT-UI-S001] Agent list uses shadcn-style UI primitives', () => {
    const dataTable = read(dataTablePath);
    const signalBadge = read(signalBadgePath);
    const emptyState = read(emptyStatePath);
    const skeletonTable = read(skeletonTablePath);
    const controlRoomFrame = read(controlRoomFramePath);

    // DataTable uses shadcn-style Table primitives.
    expect(dataTable).toContain('Table');
    expect(dataTable).toContain('TableHeader');
    expect(dataTable).toContain('TableBody');
    expect(dataTable).toContain('TableRow');
    expect(dataTable).toContain('TableHead');
    expect(dataTable).toContain('TableCell');

    // SignalBadge uses shadcn-style Badge primitive.
    expect(signalBadge).toContain('Badge');

    // EmptyState uses shadcn-style Card and Button primitives.
    expect(emptyState).toContain('Card');
    expect(emptyState).toContain('Button');

    // SkeletonTable uses shadcn-style Skeleton primitive.
    expect(skeletonTable).toContain('Skeleton');

    // ControlRoomFrame uses shadcn-style Card primitive.
    expect(controlRoomFrame).toContain('Card');
  });
});

describe('Add/edit Agent form (AGENT-MANAGEMENT-UI-S002)', () => {
  it('[AGENT-MANAGEMENT-UI-S002] Form provides accessible validation with aria-describedby', () => {
    const formField = read(formFieldPath);
    const registrationForm = read(registrationFormPath);
    const registrationSchema = read(registrationSchemaPath);
    const modelPolicyFields = read(modelPolicyFieldsPath);
    const modelPolicySchema = read(modelPolicySchemaPath);
    const newAgentPage = read(newAgentPagePath);
    const registrationSources = `${registrationForm}\n${registrationSchema}\n${modelPolicyFields}\n${modelPolicySchema}`;

    // FormField uses aria-describedby to link errors to inputs.
    expect(formField).toContain('aria-describedby');
    expect(formField).toContain('aria-invalid');
    expect(formField).toContain('role="alert"');

    // The form validates all required fields per wireframe §6.2.
    expect(registrationSources).toContain('validateRegistrationValues');
    expect(registrationSources).toContain('useForm');
    expect(registrationSources).toContain('zodResolver');
    expect(registrationSources).toContain('registrationSchema');
    expect(registrationSources).toContain('Agent ID is required');
    expect(registrationSources).toContain('RPC origin must be a valid https:// URL');
    expect(registrationSources).toContain('Display name is required');
    expect(registrationSources).toContain('Credential reference is required');
    expect(registrationSources).toContain('Key ID is required');
    expect(registrationSources).toContain('Public fingerprint is required');
    expect(registrationSources).toContain('Masked hint is required');
    expect(registrationSources).toContain('Policy ref is required');
    expect(registrationSources).toContain('Only workers-ai provider is available');
    expect(registrationSources).toContain('Max output tokens must be between 1 and 8192');

    const registrationActions = read(registrationActionsPath);

    // The form uses shadcn-style components.
    expect(registrationForm).toContain('ControlRoomFrame');
    expect(registrationForm).toContain('RhfFormField');
    expect(registrationForm).toContain('FormErrorSummary');
    expect(registrationActions).toContain('Button');

    // The form page uses one server-side submit action to avoid partial writes.
    expect(newAgentPage).toContain('submitManagedAgentRegistration');
    expect(newAgentPage).toContain('validateManagedAgentRegistrationModelPolicy');
    expect(newAgentPage).toContain("'use server'");
  });

  it('[AGENT-MANAGEMENT-UI-S002] Server validation runs before writes and rolls back partial registration', () => {
    const registrationAction = read(registrationActionPath);
    const managedAgents = read(managedAgentsPath);

    expect(registrationAction).toContain('validateManagedAgentRegistrationInput');
    expect(registrationAction).toContain('validateRegistrationModelPolicyValues');
    expect(registrationAction).toContain('isValidHttpsUrl');
    expect(registrationAction).toContain('Agent ID is already registered.');
    expect(registrationAction).toContain('writeRegistrationRecords');
    expect(registrationAction).toContain('createManagedAgent');
    expect(registrationAction).toContain('upsertCredentialReference');
    expect(registrationAction).toContain('rollbackRegistrationWrite');
    expect(registrationAction).toContain('deleteManagedAgent');
    expect(managedAgents).toContain('validateModelPolicyForRegistration');
    expect(managedAgents).toContain('initializeAgentWithDefaultModelPolicy');

    const submitStart = managedAgents.indexOf(
      'export async function submitManagedAgentRegistration'
    );
    const validateActionStart = managedAgents.indexOf(
      'export async function validateManagedAgentRegistrationModelPolicy'
    );
    const submitAction = managedAgents.slice(submitStart, validateActionStart);
    expect(submitAction).not.toContain('validateModelPolicyForRegistration');
    expect(submitAction.indexOf('persistManagedAgentRegistration')).toBeLessThan(
      submitAction.indexOf('initializeAgentWithDefaultModelPolicy')
    );
  });

  it('[AGENT-MANAGEMENT-UI-S002] Form has pending, success, and error states', () => {
    const registrationForm = read(registrationFormPath);
    const registrationActions = read(registrationActionsPath);

    // Pending state.
    expect(registrationForm).toContain('pending');
    expect(registrationActions).toContain('Registering Agent and seeding policy');

    // Error state.
    expect(registrationForm).toContain('formError');
    expect(registrationForm).toContain('role="alert"');
    expect(registrationForm).toContain('aria-live="assertive"');
    expect(registrationForm).toContain('setFocus');

    // Success state (redirect to agent overview).
    expect(registrationForm).toContain('router.push');
    expect(registrationForm).toContain('/agents/');
  });

  it('[AGENT-MANAGEMENT-UI-S002] Form does not persist client-side secrets', () => {
    const registrationForm = read(registrationFormPath);
    const formField = read(formFieldPath);
    const managedAgents = read(managedAgentsPath);

    // Credential fields use autocomplete="off".
    expect(registrationForm).toContain('autoComplete="off"');

    // The form captures references, not secrets.
    expect(registrationForm).toContain('Credential reference');
    expect(registrationForm).toContain('masked hint');
    expect(registrationForm).toContain('never plaintext secrets');

    // The server action returns browser-safe results only.
    expect(managedAgents).toContain('toBrowserSafeCredentialReference');
    expect(managedAgents).toContain('BrowserSafeCredentialReference');

    // No localStorage or sessionStorage writes.
    expect(registrationForm).not.toContain('localStorage');
    expect(registrationForm).not.toContain('sessionStorage');

    // FormField does not echo secrets.
    expect(formField).not.toContain('secretMaterial');
    expect(formField).not.toContain('privateKey');
  });

  it('[AGENT-MANAGEMENT-UI-S002] Form errors are associated with inputs via aria-describedby', () => {
    const formField = read(formFieldPath);

    // The error node has an id that matches the aria-describedby pattern.
    expect(formField).toContain('formMessageId');
    expect(formField).toContain('describedBy');
    expect(formField).toContain('role="alert"');

    // The helper text also has an id for aria-describedby.
    expect(formField).toContain('formDescriptionId');
  });
});

describe('Agent overview page (AGENT-MANAGEMENT-UI-S003)', () => {
  it('[AGENT-MANAGEMENT-UI-S003] Agent overview renders server-side profile and config data', () => {
    const overviewPage = read(agentOverviewPagePath);
    const lifecycleActions = read(agentLifecycleActionPath);

    expect(overviewPage).toContain('getAgentOverview');
    expect(overviewPage).toContain('getAgentState');
    expect(overviewPage).toContain('getManagedAgentForDisplay');
    expect(overviewPage).toContain('Profile + lifecycle');
    expect(overviewPage).toContain('Config version');
    expect(overviewPage).toContain('Credential: generation');
    expect(overviewPage).toContain('Capabilities');
    expect(overviewPage).toContain('Storage & health');
    expect(overviewPage).toContain('Durable Object storage usage');
    expect(overviewPage).toContain('Open Settings');
    expect(overviewPage).toContain('View Threads');
    expect(overviewPage).toContain('View Runs');

    expect(lifecycleActions).toContain('BrowserSafeAgentOverview');
    expect(lifecycleActions).toContain('toBrowserSafeCapabilitySummary');
    expect(lifecycleActions).toContain('capabilitySummary');
    expect(lifecycleActions).toContain('storagePercent');

    const credentialInterfaceMatch = /export interface BrowserSafeAgentCredential {[^}]+}/.exec(
      lifecycleActions
    );
    expect(credentialInterfaceMatch).not.toBeNull();
    const credentialInterface = credentialInterfaceMatch?.[0] ?? '';
    expect(credentialInterface).not.toContain('credentialRef');
    expect(credentialInterface).not.toContain('publicFingerprint');
    expect(credentialInterface).not.toContain('secretReference');
  });

  it('[AGENT-MANAGEMENT-UI-S003] Agent overview maps safe RPC error states', () => {
    const overviewPage = read(agentOverviewPagePath);

    expect(overviewPage).toContain('This Agent is not registered in the Client ledger.');
    expect(overviewPage).toContain('The Agent Worker has no aggregate for this Agent ID.');
    expect(overviewPage).toContain(
      'Agent overview is temporarily unavailable. Safe metadata only is shown.'
    );
    expect(overviewPage).toContain('You do not have permission to view this Agent.');
    expect(overviewPage).toContain(
      'This Agent is destroyed. History remains viewable; mutations are disabled.'
    );
    expect(overviewPage).toContain('OverviewErrorActions');
    expect(overviewPage).toContain('Retry overview');
    expect(overviewPage).toContain('safeOverviewErrorMessage');
  });
});

describe('Agent settings page (AGENT-MANAGEMENT-UI-S004)', () => {
  it('[AGENT-MANAGEMENT-UI-S004] Settings uses Server Actions for config update and credential rotation', () => {
    const settingsPage = read(agentSettingsPagePath);
    const settingsForm = read(settingsFormPath);
    const configSection = read(configSectionPath);
    const credentialRotation = read(credentialRotationPath);
    const settingsSchema = read(settingsSchemaPath);
    const lifecycleActions = read(agentLifecycleActionPath);
    const settingsSources = `${settingsForm}\n${configSection}\n${credentialRotation}\n${settingsSchema}`;

    expect(settingsPage).toContain('getAgentConfig');
    expect(settingsPage).toContain('getAgentOverview');
    expect(settingsPage).toContain('getActingOperatorId');
    expect(settingsPage).toContain('saveSettingsCredentialReference');
    expect(settingsPage).toContain('fingerprintValue');

    expect(settingsForm).toContain('onUpdateConfig');
    expect(settingsForm).toContain('onRotateCredential');
    expect(settingsForm).toContain('router.refresh');
    expect(settingsSources).toContain('Config must be valid JSON.');
    expect(settingsForm).toContain('Agent configuration and credentials');
    expect(settingsSources).toContain('useForm');
    expect(settingsSources).toContain('zodResolver');
    expect(settingsSources).toContain('agentConfigSchema');
    expect(settingsSources).toContain('credentialLookupSchema');
    expect(settingsSources).toContain('buildDestroyConfirmSchema');
    expect(settingsSources).toContain('RhfFormField');
    expect(settingsSources).toContain('FormControl');
    expect(settingsSources).toContain('FormMessage');
    expect(settingsSources).toContain('confirmAgentId');

    expect(configSection).toContain('AgentStateService.UpdateConfig');
    expect(configSection).toContain('ConfirmDialog');
    expect(configSection).toContain('Config editor active.');
    expect(configSection).toContain('aria-live="polite"');

    expect(credentialRotation).toContain('Current credential');
    expect(credentialRotation).toContain('Rotate Agent credential?');
    expect(credentialRotation).toContain('Acting user:');
    expect(credentialRotation).toContain('New public fingerprint');
    expect(credentialRotation).toContain('Save new reference');
    expect(credentialRotation).toContain('if (saved)');
    expect(credentialRotation).toContain('setRotateDialogOpen(false)');

    expect(lifecycleActions).toContain('clients.state.updateConfig');
    expect(lifecycleActions).toContain('clients.lifecycle.rotateAgentCredential');
    expect(lifecycleActions).toContain('const current = await clients.withErrorNormalization');
    expect(lifecycleActions).toContain('revalidatePath(`/agents/${agentId}/settings`)');
    expect(lifecycleActions).toContain('revalidatePath(`/agents/${agentId}`)');
  });

  it('[AGENT-MANAGEMENT-UI-S004] Settings browser components do not expose credential lookup payloads', () => {
    const settingsForm = read(settingsFormPath);
    const credentialRotation = read(credentialRotationPath);

    for (const source of [settingsForm, credentialRotation]) {
      expect(source).not.toContain('@connectrpc/connect');
      expect(source).not.toContain('@bufbuild/protobuf');
      expect(source).not.toContain('@cf-tamac/client-agent-rpc');
      expect(source).not.toContain('credentialRef');
      expect(source).not.toContain('publicFingerprint');
      expect(source).not.toContain('secretMaterial');
      expect(source).not.toContain('localStorage');
      expect(source).not.toContain('sessionStorage');
    }
  });

  it('[AGENT-MANAGEMENT-UI-S004] ConfirmDialog traps focus and preserves pending state', () => {
    const confirmDialog = read(confirmDialogPath);
    const detailDrawer = read(detailDrawerPath);
    const toolView = read(toolViewPath);

    expect(confirmDialog).toContain('@radix-ui/react-dialog');
    expect(confirmDialog).toContain('role="alertdialog"');
    expect(confirmDialog).toContain('onOpenAutoFocus={handleOpenAutoFocus}');
    expect(confirmDialog).toContain('onCloseAutoFocus={handleCloseAutoFocus}');
    expect(confirmDialog).toContain('onInteractOutside={handleInteractOutside}');
    expect(confirmDialog).toContain('if (!nextOpen && !pending)');
    expect(confirmDialog).toContain('aria-busy={pending}');
    expect(confirmDialog).toContain('aria-disabled={pending}');
    expect(detailDrawer).toContain('@radix-ui/react-dialog');
    expect(detailDrawer).toContain('initialFocusSelector');
    expect(detailDrawer).toContain('onOpenAutoFocus={handleOpenAutoFocus}');
    expect(detailDrawer).toContain('onCloseAutoFocus={handleCloseAutoFocus}');
    expect(toolView).toContain('initialFocusSelector="[data-drawer-initial-focus=\'true\']"');
  });

  it('[AGENT-MANAGEMENT-UI-S004] Destroy confirmation requires an exact Agent ID echo', () => {
    const schema = buildDestroyConfirmSchema('agent-alpha');

    // type-to-confirm は前後空白も許容せず、UI copy の「完全一致」を validation でも守る。
    expect(schema.safeParse({ confirmAgentId: 'agent-alpha' }).success).toBe(true);
    expect(schema.safeParse({ confirmAgentId: ' agent-alpha ' }).success).toBe(false);
  });
});

describe('Default model policy management UI (AGENT-MANAGEMENT-UI-S017, AGENT-MANAGEMENT-UI-S018)', () => {
  it('[AGENT-MANAGEMENT-UI-S017] Agent creation flow sends initial model policy through server-side RPC', () => {
    const registrationForm = read(registrationFormPath);
    const newAgentPage = read(newAgentPagePath);
    const managedAgents = read(managedAgentsPath);
    const lifecycleActions = read(agentLifecycleActionPath);
    const modelPolicyActions = read(modelPolicyActionPath);
    const modelPolicyFields = read(modelPolicyFieldsPath);

    expect(registrationForm).toContain('ModelPolicyFields');
    expect(registrationForm).toContain('onValidateModelPolicy');
    expect(modelPolicyFields).toContain('Default model policy');
    expect(modelPolicyFields).toContain('Validate policy');
    expect(newAgentPage).toContain('validateManagedAgentRegistrationModelPolicy');
    expect(managedAgents).toContain('validateModelPolicyForRegistration');
    expect(managedAgents).toContain('initializeAgentWithDefaultModelPolicy');
    expect(lifecycleActions).toContain('clients.lifecycle.initializeAgent');
    expect(lifecycleActions).toContain('initialModelPolicy');
    expect(lifecycleActions).toContain('modelPolicyRef: modelPolicy.policyRef');
    expect(modelPolicyActions).toContain('clients.modelPolicies.validateModelPolicy');
    expect(modelPolicyActions).not.toContain('localStorage');
    expect(modelPolicyActions).not.toContain('sessionStorage');
  });

  it('[AGENT-MANAGEMENT-UI-S018] Settings safely updates policy before config and renders safe metadata', () => {
    const settingsPage = read(agentSettingsPagePath);
    const settingsForm = read(settingsFormPath);
    const settingsSection = read(modelPolicySettingsSectionPath);
    const summary = read(modelPolicySummaryPath);
    const operations = read(agentOperationsPath);
    const viewModels = read(modelPolicyViewModelsPath);
    const dangerZone = read(settingsDangerZonePath);

    expect(settingsPage).toContain('getDefaultModelPolicyForManagedAgent');
    expect(settingsPage).toContain('validateModelPolicyForManagedAgent');
    expect(settingsPage).toContain('saveDefaultModelPolicy');
    expect(settingsForm).toContain('ModelPolicySettingsSection');
    expect(settingsSection).toContain('Save default policy');
    expect(settingsSection).toContain('Upsert the Agent-owned policy first');
    expect(settingsSection).toContain("result.errorCategory === 'permission_denied'");
    expect(settingsSection).toContain('disabled={pending || permissionDenied}');
    expect(summary).toContain('Policy ref');
    expect(summary).toContain('Digest');
    expect(summary).toContain('Provider');
    expect(summary).toContain('Model');
    expect(summary).toContain('Config version');
    expect(operations).toContain('upsertModelPolicyForManagedAgent');
    expect(operations).toContain('clients.state.updateConfig');
    expect(operations.indexOf('upsertModelPolicyForManagedAgent')).toBeLessThan(
      operations.indexOf('clients.state.updateConfig')
    );
    expect(viewModels).toContain('toBrowserSafeModelPolicyMetadata');
    expect(viewModels).toContain('safeModelPolicyErrorMessage');
    expect(dangerZone).toContain('Destroy Agent');
    for (const source of [settingsSection, summary]) {
      expect(source).not.toContain('@connectrpc/connect');
      expect(source).not.toContain('@cf-tamac/client-agent-rpc');
      expect(source).not.toContain('secretMaterial');
      expect(source).not.toContain('Authorization');
      expect(source).not.toContain('Bearer');
    }
  });
});

describe('Agent-owned history tabs (AGENT-MANAGEMENT-UI-S005)', () => {
  it('[AGENT-MANAGEMENT-UI-S005] Thread Event Run and Compaction tabs show Agent-owned history', () => {
    const threadList = read(threadListPath);
    const eventList = read(eventListPath);
    const runList = read(runListPath);
    const compactionView = read(compactionViewPath);
    const queries = read(agentQueriesPath);
    // タスク 2.6/3.5: standalone compactions route は廃止し、threads/runs/events が文脈 detail を持つ。
    const routeSources = [
      read(agentThreadsPagePath),
      read(agentEventsPagePath),
      read(agentRunsPagePath),
    ].join('\n');
    // Compaction context は threads 画面の文脈 detail として描画される。
    expect(read(agentCompactionsPagePath)).toContain('CompactionView');

    expect(routeSources).toContain('listThreads');
    expect(routeSources).toContain('listEvents');
    expect(routeSources).toContain('listRuns');
    expect(routeSources).toContain('getRun');
    expect(routeSources).toContain('cancelRun');
    expect(routeSources).toContain('getLatestCompaction');
    expect(routeSources).toContain('getThreadMemory');
    expect(routeSources).toContain('searchThreadHistory');

    expect(threadList).toContain('DetailDrawer');
    expect(threadList).toContain('agent_sequence');
    expect(threadList).toContain('Open Events for this Thread');
    expect(eventList).toContain('agent sequence');
    expect(eventList).toContain('causation');
    expect(eventList).toContain('payload ref metadata only');
    expect(runList).toContain('SNAPSHOT (immutable)');
    expect(runList).toContain('CAUSAL LINKS');
    expect(runList).toContain('Cancel Run');
    expect(compactionView).toContain('LATEST READY COMPACTION');
    expect(compactionView).toContain('THREAD MEMORY');
    expect(compactionView).toContain('THREAD HISTORY SEARCH');
    expect(compactionView).toContain('provenance');

    expect(queries).toContain("buildScopedPageRequest(agentId, 'threads'");
    expect(queries).toContain('buildScopedPageRequest(agentId, `events:${options.threadId}`');
    expect(queries).toContain("buildScopedPageRequest(agentId, 'runs'");
    expect(queries).toContain('buildScopedPageRequest(agentId, `history:${threadId}`');
    expect(queries).toContain('toBrowserSafePayloadReference');
    expect(threadList).toContain('PaginationBar');
    expect(eventList).toContain('PaginationBar');
    expect(runList).toContain('PaginationBar');
    expect(compactionView).toContain('PaginationBar');
  });
});

describe('Schedule management tab (AGENT-MANAGEMENT-UI-S006)', () => {
  it('[AGENT-MANAGEMENT-UI-S006] Schedule tab creates and cancels schedules', () => {
    const schedulesPage = read(agentSchedulesPagePath);
    const scheduleList = read(scheduleListPath);
    const scheduleCreateForm = read(scheduleCreateFormPath);
    const scheduleCreateSchema = read(scheduleCreateSchemaPath);
    const scheduleCreateSources = `${scheduleCreateForm}\n${scheduleCreateSchema}`;
    const operations = read(agentOperationsPath);

    expect(schedulesPage).toContain('listSchedules');
    expect(schedulesPage).toContain('createSchedule');
    expect(schedulesPage).toContain('cancelSchedule');
    expect(schedulesPage).toContain('listThreads');
    expect(scheduleList).toContain('New Schedule');
    expect(scheduleList).toContain('ScheduleCreateForm');
    expect(scheduleList).toContain('Create Schedule?');
    expect(scheduleList).toContain('ErrorAlert');
    expect(scheduleList).toContain('role="status"');
    expect(scheduleList).toContain('nextFireAtUnixMs');
    expect(scheduleList).toContain('overlap_policy');
    expect(scheduleList).toContain('Cancel Schedule');
    expect(scheduleList).toContain('Acting user:');
    expect(scheduleList).toContain('PaginationBar');
    expect(scheduleCreateSources).toContain('useForm');
    expect(scheduleCreateSources).toContain('zodResolver');
    expect(scheduleCreateSources).toContain('scheduleCreateSchema');
    expect(scheduleCreateSources).toContain('RhfFormField');
    expect(scheduleCreateSources).toContain('FormControl');
    expect(scheduleCreateSources).toContain('aria-label="Target Thread"');
    expect(scheduleCreateSources).toContain('Thread is required.');
    expect(scheduleCreateSources).toContain('Fire at is required.');
    expect(scheduleCreateSources).toContain('Interval seconds must be a positive number.');
    expect(scheduleCreateSources).toContain('Idempotency key');
    expect(scheduleCreateSources).toContain('queue-next');
    expect(scheduleCreateSources).toContain('enqueue a separate Run.');
    expect(operations).toContain("buildScopedPageRequest(agentId, 'schedules'");
    expect(operations).toContain('clients.schedules.createSchedule');
    expect(operations).toContain('clients.schedules.cancelSchedule');
    expect(operations).toContain('revalidatePath(`/agents/${agentId}/schedules`)');
  });
});

describe('Tool approval tab (AGENT-MANAGEMENT-UI-S007)', () => {
  it('[AGENT-MANAGEMENT-UI-S007] Tool approval screen requires explicit action', () => {
    const toolsPage = read(agentToolsPagePath);
    const toolView = read(toolViewPath);
    const toolReviewContent = read(toolReviewContentPath);
    const operations = read(agentOperationsPath);
    const operationViewModels = read(agentOperationViewModelsPath);

    expect(toolsPage).toContain('listTools');
    expect(toolsPage).toContain('listInvocations');
    expect(toolsPage).toContain('getInvocation');
    expect(toolsPage).toContain('approveInvocation');
    expect(toolsPage).toContain('rejectInvocation');
    expect(toolView).toContain('Tool catalog and approval queue');
    expect(toolView).toContain('ConfirmDialog');
    expect(toolView).toContain('TERMINAL_INVOCATION_STATUSES');
    expect(toolView).toContain('generateIdempotencyKey');
    expect(toolReviewContent).toContain('INPUT SUMMARY (safe projection)');
    expect(toolReviewContent).toContain('RISK / APPROVAL METADATA');
    expect(toolReviewContent).toContain('RESULT LINKS');
    expect(toolReviewContent).toContain('Invocation is already terminal.');
    expect(operations).toContain('clients.tools.getInvocation');
    expect(operations).toContain('clients.tools.approveInvocation');
    expect(operations).toContain('clients.tools.rejectInvocation');
    expect(operationViewModels).toContain('buildInputSummary');
    expect(operationViewModels).toContain('toBrowserSafePayloadReference(record?.inputRef)');
  });
});

describe('Integration management tab (AGENT-MANAGEMENT-UI-S008)', () => {
  it('[AGENT-MANAGEMENT-UI-S008] Integration screen installs lists and uninstalls generic Integration', () => {
    const integrationsPage = read(agentIntegrationsPagePath);
    const integrationView = read(integrationViewPath);
    const integrationPermissionControls = read(integrationPermissionControlsPath);
    const integrationInstallForm = read(integrationInstallFormPath);
    const integrationInstallSchema = read(integrationInstallSchemaPath);
    const integrationInstallSources = `${integrationInstallForm}\n${integrationInstallSchema}`;
    const integrationDetail = read(integrationDetailPath);
    const integrationTable = read(integrationTablePath);
    const operations = read(agentOperationsPath);
    const integrationMutations = read(
      new URL('../components/integration-view-mutations.ts', import.meta.url)
    );
    const operationViewModels = read(agentOperationViewModelsPath);

    expect(integrationsPage).toContain('listInstallations');
    expect(integrationsPage).toContain('installIntegration');
    expect(integrationsPage).toContain('uninstallIntegration');
    expect(integrationsPage).toContain('getIntegrationManagementPermission');
    expect(integrationView).toContain('Integration installations');
    expect(integrationView).toContain('ErrorAlert');
    expect(integrationView).toContain('role="status"');
    expect(integrationView).toContain('canManageIntegrations');
    expect(integrationPermissionControls).toContain('INTEGRATION_PERMISSION_COPY_ID');
    expect(integrationPermissionControls).toContain(
      'You do not have permission to manage Integrations.'
    );
    expect(integrationPermissionControls).toContain(
      'aria-describedby={canManageIntegrations ? undefined : INTEGRATION_PERMISSION_COPY_ID}'
    );
    expect(integrationInstallSources).toContain('useForm');
    expect(integrationInstallSources).toContain('zodResolver');
    expect(integrationInstallSources).toContain('integrationInstallSchema');
    expect(integrationInstallSources).toContain('RhfFormField');
    expect(integrationInstallSources).toContain('FormControl');
    expect(integrationInstallForm).toContain('Manifest URL');
    expect(integrationView).toContain('Install Integration ${installDraft?.integrationId');
    expect(integrationView).toContain('Uninstall');
    expect(integrationInstallForm).toContain('Integration ID');
    expect(integrationInstallForm).toContain('Idempotency key');
    expect(integrationInstallForm).toContain('Requested grants');
    expect(integrationInstallForm).toContain('role="alert"');
    expect(integrationInstallForm).toContain('INSTALL_VALIDATION_SUMMARY_ID');
    expect(integrationInstallForm).toContain('canInstall');
    expect(integrationInstallForm).toContain('permissionDescriptionId');
    expect(integrationInstallForm).toContain('isInstallDisabled');
    expect(integrationInstallForm).toContain('aria-describedby={');
    expect(integrationInstallForm).toContain('requestedGrants-preview');
    expect(integrationInstallForm).toContain('aria-describedby="requestedGrants-preview"');
    expect(integrationInstallForm).not.toContain('Manifest digest');
    expect(integrationMutations).toContain('input.installDraft.integrationId');
    expect(integrationMutations).toContain('parseRequestedGrantList');
    expect(integrationInstallForm).toContain('focusFirstInvalidInstallField');
    expect(integrationInstallSchema).toContain('new URL(value)');
    expect(integrationInstallSchema).toContain(
      'Add at least one requested grant before installing.'
    );
    expect(integrationMutations).not.toContain('requestedGrants: []');
    expect(integrationTable).toContain('canUninstall');
    expect(integrationTable).toContain('permissionDescriptionId');
    expect(integrationTable).toContain(
      'aria-describedby={!canUninstall ? permissionDescriptionId : undefined}'
    );
    expect(integrationDetail).toContain('canUninstall');
    expect(integrationDetail).toContain('permissionDescriptionId');
    expect(integrationDetail).toContain('provider_identity');
    expect(integrationDetail).toContain('manifest_digest');
    expect(integrationDetail).toContain('GRANTS');
    expect(integrationDetail).toContain('ADAPTER CONNECTIONS');
    expect(integrationDetail).toContain('DELIVERY CAPABILITY');
    expect(integrationDetail).toContain('SETUP INSTRUCTIONS');
    expect(integrationDetail).toContain('CLEANUP RESULT');
    expect(operations).toContain('clients.integrations.listInstallations');
    expect(operations).toContain('clients.integrations.installIntegration');
    expect(operations).toContain('clients.integrations.uninstallIntegration');
    expect(operations).toContain('enrichInstallationSummary');
    expect(operations).toContain('toBrowserSafeCleanupResult');
    expect(operationViewModels).not.toContain('connectionKey');
    expect(operationViewModels).not.toContain('externalSubject');
  });
});

describe('Browser secrecy boundaries (AGENT-MANAGEMENT-UI-S009)', () => {
  it('[AGENT-MANAGEMENT-UI-S009] Browser-visible components do not import server-only modules', () => {
    const agentList = read(agentListPath);
    const registrationForm = read(registrationFormPath);
    const registrationActions = read(registrationActionsPath);
    const modelPolicyFields = read(modelPolicyFieldsPath);
    const modelPolicySummary = read(modelPolicySummaryPath);
    const modelPolicySettingsSection = read(modelPolicySettingsSectionPath);
    const settingsDangerZone = read(settingsDangerZonePath);
    const errorAlert = read(errorAlertPath);
    const signalBadge = read(signalBadgePath);
    const emptyState = read(emptyStatePath);
    const dataTable = read(dataTablePath);
    const formField = read(formFieldPath);
    const controlRoomFrame = read(controlRoomFramePath);
    const threadList = read(threadListPath);
    const eventList = read(eventListPath);
    const runList = read(runListPath);
    const compactionView = read(compactionViewPath);
    const scheduleList = read(scheduleListPath);
    const scheduleCreateForm = read(scheduleCreateFormPath);
    const toolView = read(toolViewPath);
    const toolReviewContent = read(toolReviewContentPath);
    const integrationView = read(integrationViewPath);
    const integrationPermissionControls = read(integrationPermissionControlsPath);
    const integrationInstallForm = read(integrationInstallFormPath);
    const integrationDetail = read(integrationDetailPath);
    const integrationTable = read(integrationTablePath);

    const browserVisibleSources = [
      agentList,
      registrationForm,
      registrationActions,
      modelPolicyFields,
      modelPolicySummary,
      modelPolicySettingsSection,
      settingsDangerZone,
      errorAlert,
      signalBadge,
      emptyState,
      dataTable,
      formField,
      controlRoomFrame,
      threadList,
      eventList,
      runList,
      compactionView,
      scheduleList,
      scheduleCreateForm,
      toolView,
      toolReviewContent,
      integrationView,
      integrationPermissionControls,
      integrationInstallForm,
      integrationDetail,
      integrationTable,
    ];

    for (const source of browserVisibleSources) {
      expect(source).not.toContain("import 'server-only'");
      expect(source).not.toContain('@connectrpc/connect');
      expect(source).not.toContain('@bufbuild/protobuf');
      expect(source).not.toContain('drizzle-orm');
      expect(source).not.toContain('packages/client/src/server');
      expect(source).not.toContain('@cf-tamac/client-agent-rpc');
    }

    const agentDomainTabSources = [
      threadList,
      eventList,
      runList,
      compactionView,
      scheduleList,
      toolView,
      integrationView,
      integrationPermissionControls,
      integrationTable,
    ];

    for (const source of agentDomainTabSources) {
      expect(source).not.toContain('credentialRef');
      expect(source).not.toContain('publicFingerprint');
      expect(source).not.toContain('secretMaterial');
      expect(source).not.toContain('privateKey');
      expect(source).not.toContain('Authorization');
      expect(source).not.toContain('Bearer');
    }
  });
});

/**
 * Ed25519 signing key / trust config export / Agent key selection / health verification / rotation
 * UI (AGENT-MANAGEMENT-UI-S003, S004, S010-S016, S019, S020)。
 *
 * @remarks feature component は server-only module を直接 import せず、page (Server Component)
 * から action callback を受け取る。これらの tests は source 上の境界と UI 要素の存在を検査する。
 */
describe('Client Service signing key UI and server action boundary', () => {
  const signingKeyManagementPath = new URL(
    '../components/signing-key-management.tsx',
    import.meta.url
  );
  const trustConfigExportPath = new URL('../components/trust-config-export.tsx', import.meta.url);
  const agentSigningKeySelectPath = new URL(
    '../components/agent-signing-key-select.tsx',
    import.meta.url
  );
  const keyRotationGuidePath = new URL('../components/key-rotation-guide.tsx', import.meta.url);
  const signingKeyActionPath = new URL('../server/actions/signing-keys.ts', import.meta.url);
  const trustConfigActionPath = new URL('../server/actions/trust-config.ts', import.meta.url);
  const agentHealthActionPath = new URL('../server/actions/agent-health.ts', import.meta.url);
  const signingKeysPagePath = new URL(
    '../../app/global-settings/signing-keys/page.tsx',
    import.meta.url
  );
  const trustConfigExportPagePath = new URL(
    '../../app/global-settings/trust-config-export/page.tsx',
    import.meta.url
  );
  const keyRotationPagePath = new URL(
    '../../app/global-settings/key-rotation/page.tsx',
    import.meta.url
  );
  const globalSettingsNavPath = new URL('../components/management-nav-config.ts', import.meta.url);

  it('[AGENT-MANAGEMENT-UI-S010] signing key management UI handles key lifecycle under Global Settings', () => {
    const source = read(signingKeyManagementPath);
    const page = read(signingKeysPagePath);

    // Global Settings 配下で issuer / kid / public fingerprint / status / default / lifecycle 操作を扱う。
    expect(source).toContain('Client Service Signing Keys');
    expect(source).toContain('Public fingerprint');
    expect(source).toContain('Set default');
    expect(source).toContain('Disable');
    expect(source).toContain('Delete');
    expect(page).toContain('SigningKeyManagement');
    // private material を一切表示しない。
    expect(source).not.toContain('privateJwkCiphertext');
    expect(source).not.toContain('privateJwk');
  });

  it('[AGENT-MANAGEMENT-UI-S011] browser never receives signing material from components', () => {
    const sources = [
      read(signingKeyManagementPath),
      read(trustConfigExportPath),
      read(agentSigningKeySelectPath),
      read(keyRotationGuidePath),
    ].join('\n');

    expect(sources).not.toContain('privateJwkCiphertext');
    expect(sources).not.toContain('privateJwk');
    expect(sources).not.toContain('"d"');
    expect(sources).not.toContain('Bearer ');
    expect(sources).not.toContain('Authorization');
    // feature component は server-only module を直接 import しない。
    expect(sources).not.toContain('server/actions/signing-keys');
    expect(sources).not.toContain('server/actions/trust-config');
    expect(sources).not.toContain('server/actions/agent-health');
    expect(sources).not.toContain('server/credentials');
  });

  it('[AGENT-MANAGEMENT-UI-S012] Agent settings detail shows issuer/kid/fingerprint and verification result', () => {
    const source = read(agentSigningKeySelectPath);

    expect(source).toContain('Selected issuer / kid / fingerprint (read-only)');
    expect(source).toContain('Current Trust Match');
    expect(source).toContain('Last Verified At');
    expect(source).toContain('Safe diagnostic codes');
    // 自由入力ではなく既存 global key selection。
    expect(source).toContain('Select an existing Global signing key');
  });

  it('[AGENT-MANAGEMENT-UI-S013] trust config export produces public-only JSON under Global Settings', () => {
    const source = read(trustConfigExportPath);
    const page = read(trustConfigExportPagePath);
    const action = read(trustConfigActionPath);

    expect(page).toContain('TrustConfigExportView');
    expect(source).toContain('AGENT_CONTROL_PLANE_TRUST');
    expect(source).toContain('No private parameter');
    // action は private parameter d を含まない公開 JSON を組み立てる。
    expect(action).not.toMatch(/\.d\b/);
    expect(action).toContain('TrustConfigExport');
  });

  it('[AGENT-MANAGEMENT-UI-S014] broad scope selection shows warning and schema validation together', () => {
    const source = read(trustConfigExportPath);
    const action = read(trustConfigActionPath);

    // wireframe/spec は broad permission warning と schema validation result を同時表示することを要求する。
    // 実装は両 Alert を独立描画する (early return しない)。
    expect(source).toContain('Broad permission warning');
    expect(source).toContain('Schema validation passed');
    expect(source).toContain('Schema validation');
    // Server Action は ok:true と broadPermissionWarning を同時に返せる。
    expect(action).toContain('broadPermissionWarning');
    expect(action).toContain('ok: true');
    expect(action).toContain('resolveBroadPermissionWarning');
    // ADMIN_OPERATOR は break-glass 専用で trust config export からは除外。
    expect(action).not.toContain("principalType === 'ADMIN_OPERATOR'");
    expect(action).toContain('High-privilege scopes');
  });

  it('[AGENT-MANAGEMENT-UI-S015] rotation guidance ties trust config and Agent verification together', () => {
    const source = read(keyRotationGuidePath);
    const page = read(keyRotationPagePath);

    expect(page).toContain('KeyRotationGuide');
    expect(source).toContain('Generate replacement key');
    expect(source).toContain('Export trust config update');
    expect(source).toContain('Switch managed Agent selection');
    expect(source).toContain('Health verification before revoke');
  });

  it('[AGENT-MANAGEMENT-UI-S016] emergency revoke and break-glass recovery guidance is displayed', () => {
    const source = read(keyRotationGuidePath);

    expect(source).toContain('Emergency Revoke');
    expect(source).toContain('Break-glass Recovery');
    expect(source).toContain('ADMIN_OPERATOR');
    expect(source).toContain('revoke');
  });

  it('[AGENT-MANAGEMENT-UI-S019] selected-Agent pages route through server-only Agent RPC after trust setup', () => {
    const action = read(agentHealthActionPath);

    // Health 成功後に selected-Agent pages の実データ表示へ繋げる revalidate と Agent RPC 呼び出し。
    expect(action).toContain('verifyAgentHealth');
    expect(action).toContain('loadAgentRpcClients');
    expect(action).toContain('clients.health.check');
    expect(action).toContain('markManagedAgentSigningVerified');
    expect(action).toContain("'threads'");
    expect(action).toContain("'events'");
    expect(action).toContain("'runs'");
    expect(action).toContain("'schedules'");
    expect(action).toContain("'integrations'");
  });

  it('[AGENT-MANAGEMENT-UI-S020] Agent-zero Global Settings signing operations are reachable', () => {
    const nav = read(globalSettingsNavPath);

    expect(nav).toContain('/global-settings/signing-keys');
    expect(nav).toContain('/global-settings/trust-config-export');
    expect(nav).toContain('/global-settings/key-rotation');
  });

  it('[AGENT-MANAGEMENT-UI-S003] Agent overview rendering excludes signing material and uses server RPC', () => {
    const sources = [
      read(signingKeyManagementPath),
      read(trustConfigExportPath),
      read(agentSigningKeySelectPath),
    ].join('\n');

    // overview / settings は server action callback 経由で server-side RPC を使う。
    expect(sources).not.toContain('privateKey');
    expect(sources).not.toContain('secretMaterial');
    expect(sources).not.toContain('credentialRef');
  });

  it('[AGENT-MANAGEMENT-UI-S004] settings screen keeps signing key generation / trust export in Global Settings', () => {
    const signingAction = read(signingKeyActionPath);
    const trustAction = read(trustConfigActionPath);

    // signing key generation と trust config export は Client-wide operation として Server Action に置く。
    expect(signingAction).toContain('generateSigningKey');
    expect(signingAction).toContain('setDefaultSigningKey');
    expect(trustAction).toContain('buildTrustConfigExport');
  });
});
