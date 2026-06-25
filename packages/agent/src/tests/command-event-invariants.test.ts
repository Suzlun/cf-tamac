import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createThreadKeyIdentity, maxThreadKeyUtf8Bytes } from '../threads';

const protoPath = new URL('../../proto/cftamac/agent/v1.proto', import.meta.url);

const commandMethods = new Set([
  'AgentLifecycleService.InitializeAgent',
  'AgentLifecycleService.DestroyAgent',
  'AgentLifecycleService.RotateAgentCredential',
  'AgentModelPolicyService.UpsertModelPolicy',
  'AgentModelPolicyService.ArchiveModelPolicy',
  'AgentEventService.PublishEvent',
  'AgentRunService.CancelRun',
  'AgentStateService.UpdateConfig',
  'AgentScheduleService.CreateSchedule',
  'AgentScheduleService.CancelSchedule',
  'AgentToolService.ApproveInvocation',
  'AgentToolService.RejectInvocation',
  'AgentIntegrationService.InstallIntegration',
  'AgentIntegrationService.UninstallIntegration',
  'AgentIntegrationService.CreateAdapterConnection',
  'AgentIntegrationService.DeleteAdapterConnection',
  'IntegrationIngressService.PublishEvent',
  'IntegrationIngressService.PublishToolResult',
  'IntegrationIngressService.PublishDeliveryResult',
  'IntegrationToolService.InvokeTool',
  'IntegrationToolService.CancelOperation',
  'IntegrationDeliveryService.Deliver',
]);

const eventPublishMethods = new Set([
  'AgentEventService.PublishEvent',
  'IntegrationIngressService.PublishEvent',
]);

interface ProtoMethod {
  readonly input: string;
  readonly method: string;
  readonly service: string;
}

function collectMethods(protoText: string): ProtoMethod[] {
  const methods: ProtoMethod[] = [];
  const serviceMatches = protoText.matchAll(
    /service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  );
  for (const serviceMatch of serviceMatches) {
    const service = serviceMatch.groups?.service;
    const body = serviceMatch.groups?.body;
    if (service === undefined || body === undefined) continue;
    for (const methodMatch of body.matchAll(
      /rpc\s+(?<method>[A-Za-z]\w*)\s*\(\s*(?<input>[A-Za-z]\w*)\s*\)/g
    )) {
      const method = methodMatch.groups?.method;
      const input = methodMatch.groups?.input;
      if (method !== undefined && input !== undefined) {
        methods.push({ input, method, service });
      }
    }
  }
  return methods;
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

describe('Agent command and event invariants', () => {
  it('[AGENT-PLATFORM-S011] Command and Event publish descriptors require replay and Thread keys', () => {
    const protoText = readFileSync(fileURLToPath(protoPath.href), 'utf8');
    const methods = collectMethods(protoText);
    const messages = collectMessageFields(protoText);

    for (const method of methods) {
      const fullMethodName = `${method.service}.${method.method}`;
      const fields = messages.get(method.input);
      if (commandMethods.has(fullMethodName)) {
        expect(fields?.has('idempotency_key')).toBe(true);
      }
      if (eventPublishMethods.has(fullMethodName)) {
        expect(fields?.has('thread_key')).toBe(true);
      }
    }

    expect(createThreadKeyIdentity('agent-1', 'a'.repeat(maxThreadKeyUtf8Bytes))).toMatchObject({
      agentId: 'agent-1',
    });
    expect(() => createThreadKeyIdentity('agent-1', '')).toThrow('thread_key must not be empty.');
    expect(() => createThreadKeyIdentity('agent-1', 'a'.repeat(maxThreadKeyUtf8Bytes + 1))).toThrow(
      'thread_key must be at most 512 UTF-8 bytes after NFC normalization.'
    );
  });
});
