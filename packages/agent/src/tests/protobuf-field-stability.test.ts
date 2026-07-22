import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../../..', import.meta.url);
const typeSpecRoot = new URL('../typespec', import.meta.url);
const protoRoot = new URL('../../proto', import.meta.url);
const stableTypeSpecFixture = new URL(
  '../../../../scripts/codegen/fixtures/protobuf-field-stability/stable.tsp',
  import.meta.url
);
const missingFieldNumberFixture = new URL(
  '../../../../scripts/codegen/fixtures/protobuf-field-stability/missing-field-number.tsp',
  import.meta.url
);
const unstableProtoFixture = new URL(
  '../../../../scripts/codegen/fixtures/protobuf-field-stability/unstable-descriptors.proto',
  import.meta.url
);
const agentProtoPath = new URL('../../proto/cftamac/agent/v1.proto', import.meta.url);

function collectFiles(root: URL, suffix: string): string[] {
  const rootPath = fileURLToPath(root.href);
  if (!existsSync(rootPath)) return [];
  const entries = readdirSync(rootPath).sort();
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = `${rootPath}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(new URL(`${entry}/`, root), suffix));
    } else if (stats.isFile() && entry.endsWith(suffix)) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativePath(filePath: string): string {
  return relative(fileURLToPath(repoRoot.href), filePath).replaceAll('\\', '/');
}

function collectTypeSpecFieldIssues(files: string[]): string[] {
  const issues: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const modelMatch of text.matchAll(
      /model\s+(?<model>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
    )) {
      const model = modelMatch.groups?.model;
      const body = modelMatch.groups?.body;
      if (model === undefined || body === undefined) continue;
      const numbers = new Set<string>();
      let pendingFieldNumber: string | undefined;
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        const fieldMatch = /@field\((?<number>\d+)\)/.exec(trimmed);
        if (trimmed === '') continue;
        if (trimmed.startsWith('@') && !trimmed.includes(':')) {
          pendingFieldNumber = fieldMatch?.groups?.number ?? pendingFieldNumber;
          continue;
        }
        if (!trimmed.includes(':') || !trimmed.endsWith(';')) continue;
        const fieldNumber = fieldMatch?.groups?.number ?? pendingFieldNumber;
        if (fieldNumber === undefined) {
          issues.push(`${relativePath(file)}: ${model} field missing @field(n): ${trimmed}`);
        } else if (numbers.has(fieldNumber)) {
          issues.push(`${relativePath(file)}: ${model} reuses @field(${fieldNumber})`);
        } else {
          numbers.add(fieldNumber);
        }
        pendingFieldNumber = undefined;
      }
    }
  }
  return issues;
}

function collectProtoFieldAndServiceIssues(files: string[]): string[] {
  const issues: string[] = [];
  const services = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    issues.push(...collectProtoMessageIssues(file, text));
    issues.push(...collectProtoServiceIssues(file, text, services));
  }
  return issues;
}

function collectProtoMessageIssues(file: string, text: string): string[] {
  const issues: string[] = [];
  for (const messageMatch of text.matchAll(
    /message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  )) {
    const message = messageMatch.groups?.message;
    const body = messageMatch.groups?.body;
    if (message === undefined || body === undefined) continue;
    const numbers = new Map<string, string>();
    const reservedNumbers = new Set(
      [...body.matchAll(/reserved\s+(?<number>\d+)\s*;/g)].map(
        (match) => match.groups?.number ?? ''
      )
    );
    const reservedNames = new Set(
      [...body.matchAll(/reserved\s+"(?<name>[A-Z_a-z]\w*)"\s*;/g)].map(
        (match) => match.groups?.name ?? ''
      )
    );
    for (const fieldMatch of body.matchAll(
      /(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=\s*(?<number>\d+)\s*;/g
    )) {
      const field = fieldMatch.groups?.field;
      const number = fieldMatch.groups?.number;
      if (field === undefined || number === undefined) continue;
      if (numbers.has(number)) {
        issues.push(`${relativePath(file)}: ${message} reuses field number ${number}`);
      }
      if (reservedNumbers.has(number)) {
        issues.push(`${relativePath(file)}: ${message} reuses reserved field number ${number}`);
      }
      if (reservedNames.has(field)) {
        issues.push(`${relativePath(file)}: ${message} reuses reserved field name ${field}`);
      }
      numbers.set(number, field);
    }
  }
  return issues;
}

function collectProtoServiceIssues(file: string, text: string, services: Set<string>): string[] {
  const issues: string[] = [];
  for (const serviceMatch of text.matchAll(
    /service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
  )) {
    const service = serviceMatch.groups?.service;
    const body = serviceMatch.groups?.body;
    if (service === undefined || body === undefined) continue;
    if (services.has(service)) {
      issues.push(`${relativePath(file)}: duplicate service ${service}`);
    }
    services.add(service);
    issues.push(...collectProtoMethodIssues(file, service, body));
  }
  return issues;
}

function collectProtoMethodIssues(file: string, service: string, body: string): string[] {
  const issues: string[] = [];
  const methods = new Set<string>();
  for (const methodMatch of body.matchAll(/rpc\s+(?<method>[A-Za-z]\w*)\s*\(/g)) {
    const method = methodMatch.groups?.method;
    if (method === undefined) continue;
    if (methods.has(method)) {
      issues.push(`${relativePath(file)}: duplicate method ${service}.${method}`);
    }
    methods.add(method);
  }
  return issues;
}

describe('Agent protobuf field stability', () => {
  it('[AGENT-PLATFORM-S014] Protobuf field numbers and service methods are stable', () => {
    expect(collectTypeSpecFieldIssues(collectFiles(typeSpecRoot, '.tsp'))).toEqual([]);
    expect(collectProtoFieldAndServiceIssues(collectFiles(protoRoot, '.proto'))).toEqual([]);
    expect(collectTypeSpecFieldIssues([fileURLToPath(stableTypeSpecFixture.href)])).toEqual([]);

    expect(collectTypeSpecFieldIssues([fileURLToPath(missingFieldNumberFixture.href)])).toEqual(
      expect.arrayContaining([expect.stringContaining('missing @field(n)')])
    );
    expect(collectProtoFieldAndServiceIssues([fileURLToPath(unstableProtoFixture.href)])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('reuses field number'),
        expect.stringContaining('reuses reserved field number'),
        expect.stringContaining('reuses reserved field name'),
        expect.stringContaining('duplicate method'),
        expect.stringContaining('duplicate service'),
      ])
    );
  });

  it('[AGENT-PLATFORM-S014] pins initialization receipt field numbers across request and responses', () => {
    const proto = readFileSync(fileURLToPath(agentProtoPath.href), 'utf8');

    expect(proto).toMatch(
      /message AgentInitializationReceipt \{[\s\S]*string idempotency_key = 1;[\s\S]*string registration_request_digest = 2;/u
    );
    expect(proto).toMatch(
      /message InitializeAgentRequest \{[\s\S]*string registration_request_digest = 8;/u
    );
    expect(proto).toMatch(
      /message InitializeAgentResponse \{[\s\S]*AgentInitializationReceipt initialization_receipt = 7;/u
    );
    expect(proto).toMatch(
      /message GetAgentResponse \{[\s\S]*AgentInitializationReceipt initialization_receipt = 6;/u
    );
  });
});
