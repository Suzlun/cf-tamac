import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const protoPath = new URL('../../proto/cftamac/agent/v1.proto', import.meta.url);
const forbiddenCrossAgentMethods = new Set([
  'ListAllAgents',
  'SearchAgents',
  'ListAllToolInvocations',
  'ListAllIntegrationInstallations',
]);

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

interface ProtoMethod {
  readonly input: string;
  readonly method: string;
}

function collectServices(protoText: string): Map<string, ProtoMethod[]> {
  const services = new Map<string, ProtoMethod[]>();
  const serviceMatches = protoText.matchAll(
    /service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  );
  for (const serviceMatch of serviceMatches) {
    const service = serviceMatch.groups?.service;
    const body = serviceMatch.groups?.body;
    if (service === undefined || body === undefined) continue;
    const methods = [
      ...body.matchAll(/rpc\s+(?<method>[A-Za-z]\w*)\s*\(\s*(?<input>[A-Za-z]\w*)\s*\)/g),
    ].map((methodMatch) => ({
      input: methodMatch.groups?.input ?? '',
      method: methodMatch.groups?.method ?? '',
    }));
    services.set(service, methods);
  }
  return services;
}

function collectMessageFields(protoText: string): Map<string, Set<string>> {
  const messages = new Map<string, Set<string>>();
  const messageMatches = protoText.matchAll(
    /message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  );
  for (const messageMatch of messageMatches) {
    const message = messageMatch.groups?.message;
    const body = messageMatch.groups?.body;
    if (message === undefined || body === undefined) continue;
    const fields = new Set<string>();
    for (const fieldMatch of body.matchAll(
      /(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=/g
    )) {
      const field = fieldMatch.groups?.field;
      if (field !== undefined) fields.add(field);
    }
    messages.set(message, fields);
  }
  return messages;
}

describe('Agent RPC schema invariants', () => {
  it('[AGENT-PLATFORM-S010] Public RPC descriptors require agent_id and no cross-Agent list/search', () => {
    const protoText = readFileSync(fileURLToPath(protoPath.href), 'utf8');
    const services = collectServices(protoText);
    const messages = collectMessageFields(protoText);

    for (const [service, methods] of rpcServiceInventory) {
      const foundMethods = services.get(service);
      expect(foundMethods).toBeDefined();
      for (const method of methods) {
        expect(foundMethods?.some((descriptor) => descriptor.method === method)).toBe(true);
      }
    }

    for (const [service, methods] of services) {
      for (const method of methods) {
        expect(forbiddenCrossAgentMethods.has(method.method)).toBe(false);
        expect(messages.get(method.input)?.has('agent_id')).toBe(true);
        expect(service).not.toBe('AgentCrossService');
      }
    }
  });
});
