import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { agentFoundationTables, agentStorageRepositoryNames } from '../storage';

const aiAgentIntegrationHandlersPath = new URL(
  '../durable-object/integration-handlers.ts',
  import.meta.url
);
const schedulerWakePath = new URL('../durable-object/scheduler-wake.ts', import.meta.url);
const adapterNormalizationPath = new URL('../adapters/normalization.ts', import.meta.url);
const deliveryProviderClientPath = new URL(
  '../rpc/integration-delivery-provider-client.ts',
  import.meta.url
);
const integrationDispatchPath = new URL('../rpc/dispatch/integrations.ts', import.meta.url);
const integrationIngressDispatchPath = new URL(
  '../rpc/dispatch/integration-ingress.ts',
  import.meta.url
);
const integrationIngressSignaturePath = new URL(
  '../rpc/dispatch/integration-ingress-signature.ts',
  import.meta.url
);
const integrationManifestPath = new URL('../integrations/manifest.ts', import.meta.url);
const integrationDeliveryClassificationPath = new URL(
  '../integrations/delivery-classification.ts',
  import.meta.url
);
const integrationDeliveryOperationsPath = new URL(
  '../integrations/operations-delivery.ts',
  import.meta.url
);
const integrationIngressOperationsPath = new URL(
  '../integrations/operations-ingress.ts',
  import.meta.url
);
const integrationConnectionOperationsPath = new URL(
  '../integrations/operations-connections.ts',
  import.meta.url
);
const integrationInstallOperationsPath = new URL(
  '../integrations/operations-install.ts',
  import.meta.url
);
const integrationUninstallOperationsPath = new URL(
  '../integrations/operations-uninstall.ts',
  import.meta.url
);
const integrationSecurityPath = new URL('../integrations/security.ts', import.meta.url);
const integrationServicePath = new URL('../rpc/services/integrations.ts', import.meta.url);
const ingressServicePath = new URL('../rpc/services/agent-adapter.ts', import.meta.url);
const repositoryPath = new URL(
  '../storage/repositories/integrations-repository.ts',
  import.meta.url
);
const schemaPath = new URL('../storage/schema/integration.ts', import.meta.url);
const tableInitializerPath = new URL('../storage/initializers/integration.ts', import.meta.url);

describe('Agent Stage 7 Integration implementation', () => {
  it('[AGENT-INTEGRATION-S001] InstallIntegration verifies signed manifest before activation', () => {
    const manifest = readSource(integrationManifestPath);
    const operations = readSource(integrationInstallOperationsPath);

    expect(manifest).toContain('resolveAndVerifyIntegrationManifest');
    expect(manifest).toContain('verifyManifestSignature');
    expect(manifest).toContain('supportedIntegrationManifestSchemaVersion');
    expect(manifest).toContain('assertRequestedGrants');
    expect(manifest).toContain('computeSha256Hex(manifestBytes)');
    expect(operations).toContain("status: 'installing'");
    expect(operations).toContain('status: finalStatus');
    expect(operations).toContain('input.command.requestedGrants');
    expect(operations).not.toContain(
      'persistIntegrationGrants(repositories, installationId, manifest.grants'
    );
  });

  it('[AGENT-INTEGRATION-S002] Successful install persists grants, adapters, tools, delivery, and trust key', () => {
    const schema = readSource(schemaPath);
    const repository = readSource(repositoryPath);
    const operations = readSource(integrationInstallOperationsPath);
    const tableInitializer = readSource(tableInitializerPath);

    expect(agentFoundationTables).toEqual(
      expect.arrayContaining([
        'agent_integration_installations',
        'agent_integration_grants',
        'agent_installation_trust_keys',
        'agent_integration_adapters',
        'agent_delivery_contexts',
        'agent_adapter_deliveries',
      ])
    );
    expect(agentStorageRepositoryNames).toEqual(
      expect.arrayContaining(['AgentIntegrationsRepository'])
    );
    expect(schema).toContain('agentIntegrationStorageDrizzleSchema');
    expect(repository).toContain('insertTrustKey');
    expect(repository).toContain('upsertAdapterDefinition');
    expect(operations).toContain('repositories.tools.upsertDefinition({');
    expect(operations).toContain('persistIntegrationGrants(');
    expect(tableInitializer).toContain('CREATE TABLE IF NOT EXISTS agent_adapter_deliveries');
  });

  it('[AGENT-INTEGRATION-S003] Installation can remain pending external setup without exposing secrets', () => {
    const manifest = readSource(integrationManifestPath);
    const operations = readSource(integrationInstallOperationsPath);

    expect(manifest).toContain('setupRequired');
    expect(manifest).toContain('setupInstructionsRef');
    expect(operations).toContain("manifest.setupRequired ? 'pending_external_setup' : 'active'");
    expect(operations).toContain("status: finalStatus === 'active' ? 'active' : 'unavailable'");
    expect(operations).not.toContain('secret');
  });

  it('[AGENT-INTEGRATION-S004] Adapter Connection lifecycle is Agent-local and scoped', () => {
    const adapterNormalization = readSource(adapterNormalizationPath);
    const integrationDispatch = readSource(integrationDispatchPath);
    const operations = readSource(integrationConnectionOperationsPath);
    const service = readSource(integrationServicePath);

    expect(adapterNormalization).toContain('normalizeAdapterConnectionInput');
    expect(operations).toContain('createAdapterConnectionInStore');
    expect(operations).toContain('deleteAdapterConnectionInStore');
    expect(operations).toContain('listAdapterConnectionsFromStore');
    expect(operations).toContain("status: 'disabled'");
    expect(integrationDispatch).toContain('dispatchCreateAdapterConnection');
    expect(integrationDispatch).toContain('createAdapterConnection({');
    expect(service).toContain("from '../dispatch/integrations'");
    expect(service).toContain('dispatchCreateAdapterConnection(env, request)');
  });

  it('[AGENT-INTEGRATION-S005] Signed Integration ingress appends Event and DeliveryContext', () => {
    const aiAgentIntegrationHandlers = readSource(aiAgentIntegrationHandlersPath);
    const operations = readSource(integrationIngressOperationsPath);
    const ingressDispatch = readSource(integrationIngressDispatchPath);
    const ingressSignature = readSource(integrationIngressSignaturePath);
    const security = readSource(integrationSecurityPath);
    const ingressService = readSource(ingressServicePath);

    expect(security).toContain('verifyIntegrationDetachedSignature');
    expect(security).toContain('findActiveTrustKey');
    expect(operations).toContain('publishIntegrationEventInStore');
    expect(operations).toContain('publishEventInStore({');
    expect(operations).toContain('createDeliveryContext({');
    expect(ingressDispatch).toContain('createUnsignedIngressBodyDigest');
    expect(ingressSignature).toContain('stripIngressSignatureMetadata');
    expect(security).toContain('canonicalBodyDigest');
    expect(aiAgentIntegrationHandlers).toContain("reason: 'event_accepted'");
    expect(ingressService).toContain('dispatchPublishIntegrationEvent(env, request)');
  });

  it('[AGENT-INTEGRATION-S006] Delivery uses signed generated binary Provider RPC', () => {
    const deliveryProviderClient = readSource(deliveryProviderClientPath);
    const operations = readSource(integrationDeliveryOperationsPath);

    expect(deliveryProviderClient).toContain('IntegrationDeliveryService.method.deliver.name');
    expect(deliveryProviderClient).toContain('toBinary(DeliverRequestSchema');
    expect(deliveryProviderClient).toContain('fromBinary(input.outputSchema');
    expect(deliveryProviderClient).toContain('buildIntegrationDeliverySignatureMetadata');
    expect(deliveryProviderClient).toContain("'Content-Type': 'application/proto'");
    expect(operations).toContain('deliverToIntegrationProvider');
    expect(operations).toContain('createAdapterDelivery({');
    expect(operations).toContain('AdapterDelivery not found.');
    expect(operations).toContain('Delivery result does not match the original DeliveryContext.');
    expect(operations).toContain(
      'requireDeliveryContext(input.repositories, delivery.deliveryContextId)'
    );
    expect(operations).toContain('assertInstallationActive(installation)');
    expect(deliveryProviderClient).not.toContain('JSON.stringify');
  });

  it('[AGENT-INTEGRATION-S007] Uninstall disables capabilities and preserves ledgers', () => {
    const operations = readSource(integrationUninstallOperationsPath);
    const repository = readSource(repositoryPath);

    expect(operations).toContain("status: 'uninstalling'");
    expect(operations).toContain('disableAdapterConnectionsByInstallation');
    expect(operations).toContain('revokeIntegrationTools');
    expect(operations).toContain('cancelPendingIntegrationInvocations');
    expect(operations).toContain('cancelSchedulesByInstallation');
    expect(operations).toContain('revokeDeliveryContextsByInstallation');
    expect(operations).toContain('revokeTrustKeysByInstallation');
    expect(repository).toContain('revokeGrantsByInstallation');
  });

  it('[AGENT-INTEGRATION-S008] Generic Provider boundary avoids platform-specific protocol leakage', () => {
    const adapterNormalization = readSource(adapterNormalizationPath);
    const manifest = readSource(integrationManifestPath);
    const operations = readSource(integrationInstallOperationsPath);

    expect(adapterNormalization).toContain('Provider 種別に依存する意味付けはしません');
    expect(manifest).toContain('delivery_capabilities');
    expect(operations).toContain('manifest.adapters');
    expect(operations).toContain('manifest.tools');
    expect(`${adapterNormalization}\n${manifest}\n${operations}`).not.toMatch(
      /discord|slack|github/i
    );
  });

  it('[AGENT-INTEGRATION-S009] Connection allowlist accepts only granted model policy overrides', () => {
    const manifest = readSource(integrationManifestPath);
    const operations = `${readSource(integrationInstallOperationsPath)}\n${readSource(integrationConnectionOperationsPath)}`;
    const ingress = readSource(integrationIngressOperationsPath);
    const mapper = readSource(new URL('../rpc/mappers/integrations.ts', import.meta.url));
    const ingressDispatch = readSource(integrationIngressDispatchPath);

    expect(manifest).toContain('allowedModelPolicyRefs');
    expect(operations).toContain('allowedModelPolicyRefs: manifest.allowedModelPolicyRefs');
    expect(operations).toContain('allowedModelPolicyRefs: deserializePolicyRefList');
    expect(ingress).toContain('assertIntegrationModelPolicyOverrideAllowed');
    expect(ingress.indexOf('await verifyIntegrationIngressSignature')).toBeLessThan(
      ingress.indexOf('assertIntegrationModelPolicyOverrideAllowed')
    );
    expect(ingress).toContain(
      'Integration model policy override is outside the Adapter Connection allowlist.'
    );
    expect(ingress).toContain('repositories.modelPolicies.getActivePolicy(policyRef)');
    expect(ingressDispatch).toContain('modelPolicyRef: event?.modelPolicyRef');
    expect(mapper).toContain('allowedModelPolicyRefs: [...connection.allowedModelPolicyRefs]');
  });

  it('[AGENT-INTEGRATION-S010] Delivery result classifies resume failure follow-up and stale callbacks', () => {
    const aiAgentIntegrationHandlers = readSource(aiAgentIntegrationHandlersPath);
    const schedulerWake = readSource(schedulerWakePath);
    const delivery = `${readSource(integrationDeliveryOperationsPath)}\n${readSource(integrationDeliveryClassificationPath)}`;
    const mapper = readSource(new URL('../rpc/mappers/integrations.ts', import.meta.url));

    expect(delivery).toContain('classifyDeliveryResult');
    expect(delivery).toContain("'resume'");
    expect(delivery).toContain("'terminal_failure'");
    expect(delivery).toContain("'follow_up_event'");
    expect(delivery).toContain("'stale_callback'");
    expect(delivery).toContain('Delivery result provider operation identity does not match.');
    expect(delivery).toContain("fromStatus: 'waiting'");
    expect(delivery).toContain("toStatus: 'pending'");
    expect(delivery).toContain('appendDeliveryFollowUpEvent');
    expect(schedulerWake).toContain("['follow_up_event', 'resume']");
    expect(schedulerWake).toContain('shouldRequestDeliveryResumeWake');
    expect(aiAgentIntegrationHandlers).toContain('shouldRequestDeliveryResumeWake(deliveryResult)');
    expect(aiAgentIntegrationHandlers).toContain('context.requestSchedulerWake({');
    expect(mapper).toContain('resumeAction: result.resumeAction');
  });
});

function readSource(path: URL): string {
  return readFileSync(fileURLToPath(path.href), 'utf8');
}
