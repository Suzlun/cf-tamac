import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const protoPath = new URL('../../proto/cftamac/agent/v1.proto', import.meta.url);
const generatedRpcPath = new URL('../generated/rpc/cftamac/agent/v1_pb.ts', import.meta.url);
const agentAdapterTypeSpecPath = new URL(
  '../typespec/src/services/agent-adapter.tsp',
  import.meta.url
);

const forbiddenOpenApiPaths = [
  new URL('../../openapi', import.meta.url),
  new URL('../typespec/openapi', import.meta.url),
  new URL('../generated/openapi', import.meta.url),
];

const rpcServiceInventory = new Map<string, string[]>([
  [
    'AgentLifecycleService',
    ['InitializeAgent', 'GetAgent', 'DestroyAgent', 'RotateAgentCredential'],
  ],
  ['AgentEventService', ['PublishEvent', 'GetEvent', 'ListEvents']],
  [
    'AgentThreadService',
    [
      'ListThreads',
      'GetThread',
      'ListSections',
      'GetLatestCompaction',
      'GetThreadMemory',
      'SearchThreadHistory',
    ],
  ],
  ['AgentRunService', ['GetRun', 'ListRuns', 'CancelRun']],
  ['AgentStateService', ['GetState', 'GetConfig', 'UpdateConfig']],
  ['AgentScheduleService', ['CreateSchedule', 'GetSchedule', 'ListSchedules', 'CancelSchedule']],
  [
    'AgentToolService',
    ['ListTools', 'GetInvocation', 'ListInvocations', 'ApproveInvocation', 'RejectInvocation'],
  ],
  [
    'AgentIntegrationService',
    [
      'InstallIntegration',
      'UninstallIntegration',
      'GetInstallation',
      'ListInstallations',
      'CreateAdapterConnection',
      'DeleteAdapterConnection',
      'ListAdapterConnections',
    ],
  ],
  ['IntegrationIngressService', ['PublishEvent', 'PublishToolResult', 'PublishDeliveryResult']],
  ['AgentHealthService', ['Check']],
]);

const expectedMessages = [
  'RpcErrorDetail',
  'PageRequest',
  'PrincipalContext',
  'ThreadKeyValidation',
  'AgentProfile',
  'AccessCredential',
  'AgentThread',
  'AgentThreadSection',
  'AgentEvent',
  'AgentRun',
  'ThreadCompaction',
  'ThreadHistoryResult',
  'ThreadMemory',
  'AgentStateSnapshot',
  'AgentSchedule',
  'AgentTool',
  'IntegrationInstallation',
  'AdapterConnection',
];

function readText(url: URL): string {
  return readFileSync(fileURLToPath(url.href), 'utf8');
}

function collectProtoServices(protoText: string): Map<string, Set<string>> {
  const services = new Map<string, Set<string>>();
  const serviceMatches = protoText.matchAll(
    /service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  );

  for (const serviceMatch of serviceMatches) {
    const service = serviceMatch.groups?.service;
    const body = serviceMatch.groups?.body;
    if (service === undefined || body === undefined) continue;
    const methods = new Set<string>();
    for (const methodMatch of body.matchAll(/rpc\s+(?<method>[A-Za-z]\w*)\s*\(/g)) {
      const method = methodMatch.groups?.method;
      if (method !== undefined) methods.add(method);
    }
    services.set(service, methods);
  }

  return services;
}

describe('Agent contract generation', () => {
  it('[AGENT-PLATFORM-S001] TypeSpec emits proto3 without Agent OpenAPI', () => {
    const protoText = readText(protoPath);
    const generatedRpcText = readText(generatedRpcPath);
    const agentAdapterTypeSpecText = readText(agentAdapterTypeSpecPath);
    const services = collectProtoServices(protoText);

    expect(protoText).toContain('syntax = "proto3";');
    expect(protoText).toContain('package cftamac.agent.v1;');

    for (const message of expectedMessages) {
      expect(protoText).toContain(`message ${message} {`);
    }

    for (const [service, methods] of rpcServiceInventory) {
      expect(services.has(service)).toBe(true);
      expect(generatedRpcText).toContain(`export const ${service}`);
      for (const method of methods) {
        expect(services.get(service)?.has(method)).toBe(true);
      }
    }

    expect(agentAdapterTypeSpecText).toContain('interface IntegrationIngressService');
    expect(agentAdapterTypeSpecText).toContain('PublishEvent(...PublishIntegrationEventRequest)');
    expect(agentAdapterTypeSpecText).toContain('PublishToolResult(...PublishToolResultRequest)');
    expect(agentAdapterTypeSpecText).toContain(
      'PublishDeliveryResult(...PublishDeliveryResultRequest)'
    );

    for (const forbiddenPath of forbiddenOpenApiPaths) {
      expect(existsSync(fileURLToPath(forbiddenPath.href))).toBe(false);
    }
  });
});
