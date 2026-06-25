import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const protoPath = new URL('../../proto/cftamac/agent/v1.proto', import.meta.url);
const generatedRpcPath = new URL('../generated/rpc/cftamac/agent/v1_pb.ts', import.meta.url);
const rootPackageJsonPath = new URL('../../../../package.json', import.meta.url);
const agentPackageJsonPath = new URL('../../package.json', import.meta.url);
const agentBufYamlPath = new URL('../../buf.yaml', import.meta.url);
const agentBufGenYamlPath = new URL('../../buf.gen.yaml', import.meta.url);
const agentTypeSpecConfigPath = new URL('../typespec/tspconfig.yaml', import.meta.url);
const agentAdapterTypeSpecPath = new URL(
  '../typespec/src/services/agent-adapter.tsp',
  import.meta.url
);
const agentModelPolicyTypeSpecPath = new URL(
  '../typespec/src/services/agent-model-policy.tsp',
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
  [
    'AgentModelPolicyService',
    [
      'UpsertModelPolicy',
      'GetModelPolicy',
      'ListModelPolicies',
      'ArchiveModelPolicy',
      'ValidateModelPolicy',
    ],
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
  ['IntegrationToolService', ['InvokeTool', 'GetOperation', 'CancelOperation']],
  ['IntegrationDeliveryService', ['Deliver']],
  ['AgentHealthService', ['Check']],
]);

const expectedMessages = [
  'RpcErrorDetail',
  'PageRequest',
  'PrincipalContext',
  'ThreadKeyValidation',
  'AgentProfile',
  'AccessCredential',
  'CredentialRotationPolicy',
  'AgentPrincipal',
  'AgentGrant',
  'AgentAuditRecord',
  'AgentThread',
  'AgentThreadSection',
  'AgentEvent',
  'AgentRun',
  'AgentRunInput',
  'RunSnapshotReference',
  'AgentModelPolicyInput',
  'AgentModelPolicy',
  'AgentModelPolicySummary',
  'AgentModelPolicyValidationResult',
  'ModelPolicyValidationIssue',
  'RunModelPolicySnapshot',
  'AgentModelInvocationSummary',
  'ModelExecutionCapability',
  'ThreadCompaction',
  'CompactionSnapshotReference',
  'ThreadHistoryResult',
  'ThreadMemory',
  'AgentMemory',
  'AgentStateSnapshot',
  'AgentSchedule',
  'AgentTool',
  'ToolDefinition',
  'IntegrationInstallation',
  'IntegrationDefinition',
  'AdapterConnection',
  'DeliveryContext',
  'AdapterDelivery',
  'ProviderOperation',
  'BytePayloadReference',
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

function collectProtoServiceUniquenessIssues(protoText: string): string[] {
  const issues: string[] = [];
  const serviceNames = new Set<string>();
  const serviceMatches = protoText.matchAll(
    /service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  );

  for (const serviceMatch of serviceMatches) {
    const service = serviceMatch.groups?.service;
    const body = serviceMatch.groups?.body;
    if (service === undefined || body === undefined) continue;
    if (serviceNames.has(service)) {
      issues.push(`duplicate service ${service}`);
    }
    serviceNames.add(service);

    const methodNames = new Set<string>();
    for (const methodMatch of body.matchAll(/rpc\s+(?<method>[A-Za-z]\w*)\s*\(/g)) {
      const method = methodMatch.groups?.method;
      if (method === undefined) continue;
      if (methodNames.has(method)) {
        issues.push(`duplicate method ${service}.${method}`);
      }
      methodNames.add(method);
    }
  }

  return issues;
}

interface ProtoMethodDescriptor {
  readonly input: string;
  readonly method: string;
  readonly output: string;
}

function collectProtoMethodDescriptors(protoText: string): Map<string, ProtoMethodDescriptor[]> {
  const services = new Map<string, ProtoMethodDescriptor[]>();
  const serviceMatches = protoText.matchAll(
    /service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  );

  for (const serviceMatch of serviceMatches) {
    const service = serviceMatch.groups?.service;
    const body = serviceMatch.groups?.body;
    if (service === undefined || body === undefined) continue;
    const methods = [
      ...body.matchAll(
        /rpc\s+(?<method>[A-Za-z]\w*)\s*\(\s*(?<input>[A-Za-z]\w*)\s*\)\s*returns\s*\(\s*(?<output>[A-Za-z]\w*)\s*\)/g
      ),
    ].map((methodMatch) => ({
      input: methodMatch.groups?.input ?? '',
      method: methodMatch.groups?.method ?? '',
      output: methodMatch.groups?.output ?? '',
    }));
    services.set(service, methods);
  }

  return services;
}

function collectProtoMessageFields(protoText: string): Map<string, Set<string>> {
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

function readPackageScripts(url: URL): Record<string, string> {
  const parsed = JSON.parse(readText(url)) as { readonly scripts?: Record<string, string> };
  return parsed.scripts ?? {};
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

  it('[AGENT-MODEL-POLICY-S004] AgentModelPolicyService exposes Agent-scoped secret-free descriptors', () => {
    const protoText = readText(protoPath);
    const generatedRpcText = readText(generatedRpcPath);
    const serviceMethods = collectProtoMethodDescriptors(protoText).get('AgentModelPolicyService');
    const messages = collectProtoMessageFields(protoText);

    // 生成済み descriptor だけを検査し、runtime/storage 実装に踏み込まず契約不変条件を確認します。
    expect(serviceMethods?.map((method) => method.method)).toEqual([
      'UpsertModelPolicy',
      'GetModelPolicy',
      'ListModelPolicies',
      'ArchiveModelPolicy',
      'ValidateModelPolicy',
    ]);
    expect(generatedRpcText).toContain('export const AgentModelPolicyService');

    for (const method of serviceMethods ?? []) {
      expect(messages.get(method.input)?.has('agent_id')).toBe(true);
    }
    expect(messages.get('UpsertModelPolicyRequest')?.has('idempotency_key')).toBe(true);
    expect(messages.get('ArchiveModelPolicyRequest')?.has('idempotency_key')).toBe(true);

    for (const responseMessage of [
      'AgentModelPolicy',
      'AgentModelPolicySummary',
      'AgentModelPolicyValidationResult',
      'ModelPolicyValidationIssue',
      'UpsertModelPolicyResponse',
      'GetModelPolicyResponse',
      'ListModelPoliciesResponse',
      'ArchiveModelPolicyResponse',
      'ValidateModelPolicyResponse',
    ]) {
      const responseFields = messages.get(responseMessage);
      expect(responseFields).toBeDefined();
      for (const field of responseFields ?? []) {
        expect(field).not.toMatch(/credential|secret|raw_?prompt|raw_?completion|raw_?reasoning/i);
      }
    }
  });

  it('[AGENT-PLATFORM-S016] AgentModelPolicyService remains generated Protobuf RPC-only', () => {
    const protoText = readText(protoPath);
    const generatedRpcText = readText(generatedRpcPath);
    const agentModelPolicyTypeSpecText = readText(agentModelPolicyTypeSpecPath);
    const services = collectProtoServices(protoText);

    // policy 管理を REST/OpenAPI/Orval へ分岐させず、TypeSpec と Protobuf-ES descriptor だけで公開します。
    expect(services.get('AgentModelPolicyService')).toEqual(
      new Set([
        'UpsertModelPolicy',
        'GetModelPolicy',
        'ListModelPolicies',
        'ArchiveModelPolicy',
        'ValidateModelPolicy',
      ])
    );
    expect(agentModelPolicyTypeSpecText).toContain('@Protobuf.service');
    expect(agentModelPolicyTypeSpecText).toContain('interface AgentModelPolicyService');
    expect(generatedRpcText).toContain('export const AgentModelPolicyService');
    expect(protoText).toContain('service AgentModelPolicyService');

    for (const forbiddenPath of forbiddenOpenApiPaths) {
      expect(existsSync(fileURLToPath(forbiddenPath.href))).toBe(false);
    }
    expect(agentModelPolicyTypeSpecText).not.toMatch(/openapi|orval|rest|json api/i);
  });

  it('[AGENT-PLATFORM-S001] TypeSpec, Buf, RPC generation, and drift guard scripts stay wired', () => {
    const rootScripts = readPackageScripts(rootPackageJsonPath);
    const agentScripts = readPackageScripts(agentPackageJsonPath);
    const bufYaml = readText(agentBufYamlPath);
    const bufGenYaml = readText(agentBufGenYamlPath);
    const typeSpecConfig = readText(agentTypeSpecConfigPath);

    expect(rootScripts['gen:agent:proto']).toContain('@cf-tamac/agent');
    expect(rootScripts['gen:agent:rpc']).toContain('@cf-tamac/agent');
    expect(rootScripts['check:codegen']).toContain('scripts/codegen/check-agent-codegen-drift.mjs');
    expect(rootScripts['check:codegen']).toContain('git diff --exit-code');
    expect(agentScripts['gen:proto']).toBe('tsp compile src/typespec');
    expect(agentScripts['lint:proto']).toBe('buf lint');
    expect(agentScripts['breaking:proto']).toBe('buf breaking --against proto');
    expect(agentScripts['gen:rpc']).toContain('buf generate');
    expect(bufYaml).toContain('version: v2');
    expect(bufYaml).toContain('- path: proto');
    expect(bufYaml).toContain('breaking:');
    expect(bufGenYaml).toContain('out: src/generated/rpc');
    expect(bufGenYaml).toContain('out: ../client/src/generated/agent-rpc');
    expect(typeSpecConfig).toContain('@typespec/protobuf');
    expect(typeSpecConfig).not.toMatch(/openapi|orval/i);
  });

  it('[AGENT-PLATFORM-S014] generated services and methods remain unique', () => {
    const protoText = readText(protoPath);

    expect(collectProtoServiceUniquenessIssues(protoText)).toEqual([]);
  });

  it('[AGENT-INTEGRATION-S004] keeps Adapter Connection management on AgentIntegrationService only', () => {
    const protoText = readText(protoPath);
    const agentAdapterTypeSpecText = readText(agentAdapterTypeSpecPath);
    const services = collectProtoServices(protoText);

    expect([...(services.get('AgentIntegrationService') ?? [])]).toEqual(
      expect.arrayContaining([
        'CreateAdapterConnection',
        'DeleteAdapterConnection',
        'ListAdapterConnections',
      ])
    );
    expect([...(services.get('IntegrationIngressService') ?? [])].sort()).toEqual([
      'PublishDeliveryResult',
      'PublishEvent',
      'PublishToolResult',
    ]);
    expect(agentAdapterTypeSpecText).not.toContain('CreateAdapterConnection');
    expect(agentAdapterTypeSpecText).not.toContain('DeleteAdapterConnection');
    expect(agentAdapterTypeSpecText).not.toContain('ListAdapterConnections');
    expect(agentAdapterTypeSpecText).not.toContain('GetAdapterConnection');
  });

  it('[AGENT-TOOL-S005] [AGENT-TOOL-S007] [AGENT-TOOL-S008] [AGENT-INTEGRATION-S006] emits Provider-facing Tool and Delivery RPC contracts', () => {
    const protoText = readText(protoPath);
    const generatedRpcText = readText(generatedRpcPath);
    const services = collectProtoServices(protoText);

    expect([...(services.get('IntegrationToolService') ?? [])].sort()).toEqual([
      'CancelOperation',
      'GetOperation',
      'InvokeTool',
    ]);
    expect([...(services.get('IntegrationDeliveryService') ?? [])]).toEqual(['Deliver']);
    expect(protoText).toContain('message InvokeToolRequest {');
    expect(protoText).toContain('string agent_id = 1;');
    expect(protoText).toContain('string idempotency_key = 2;');
    expect(protoText).toContain('message DeliverRequest {');
    expect(generatedRpcText).toContain('export const IntegrationToolService');
    expect(generatedRpcText).toContain('export const IntegrationDeliveryService');
  });
});
