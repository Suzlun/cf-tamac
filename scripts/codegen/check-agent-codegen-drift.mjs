import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const typeSpecRoot = `${projectRoot}/packages/agent/src/typespec`;
const protoRoot = `${projectRoot}/packages/agent/proto`;
const agentGeneratedRoot = `${projectRoot}/packages/agent/src/generated/rpc`;
const clientGeneratedRoot = `${projectRoot}/packages/client/src/generated/agent-rpc`;
const forbiddenOpenApiRoots = [
  `${projectRoot}/packages/agent/openapi`,
  `${projectRoot}/packages/agent/src/typespec/openapi`,
  `${projectRoot}/packages/agent/src/generated/openapi`,
];

export const rpcServiceInventory = new Map([
  ['AgentLifecycleService', ['InitializeAgent', 'GetAgent', 'DestroyAgent', 'RotateAgentCredential']],
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
  ['AgentToolService', ['ListTools', 'GetInvocation', 'ListInvocations', 'ApproveInvocation', 'RejectInvocation']],
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

const forbiddenCrossAgentMethods = new Set([
  'ListAllAgents',
  'SearchAgents',
  'ListAllToolInvocations',
  'ListAllIntegrationInstallations',
]);

const commandMethods = new Set([
  'AgentLifecycleService.InitializeAgent',
  'AgentLifecycleService.DestroyAgent',
  'AgentLifecycleService.RotateAgentCredential',
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
]);

const eventPublishMethods = new Set([
  'AgentEventService.PublishEvent',
  'IntegrationIngressService.PublishEvent',
]);

function listFiles(root, suffix) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => `${entry.parentPath}/${entry.name}`);
}

export function snapshotGeneratedTree(root, suffixes = ['.proto', '.ts']) {
  const files = new Set(suffixes.flatMap((suffix) => listFiles(root, suffix)));
  return new Map(
    [...files]
      .map((file) => [relative(root, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')])
      .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
  );
}

function normalizeFileMap(files) {
  return files instanceof Map ? files : new Map(Object.entries(files));
}

export function collectGeneratedTreeDriftIssues(expectedFiles, actualFiles, label = 'generated output') {
  const expected = normalizeFileMap(expectedFiles);
  const actual = normalizeFileMap(actualFiles);
  const issues = [];

  for (const [file, expectedContent] of expected) {
    if (!actual.has(file)) {
      issues.push(`${label}: missing ${file}`);
      continue;
    }
    if (actual.get(file) !== expectedContent) {
      issues.push(`${label}: drifted ${file}`);
    }
  }

  for (const file of actual.keys()) {
    if (!expected.has(file)) {
      issues.push(`${label}: unexpected ${file}`);
    }
  }

  return issues;
}

export function parseProtoServices(protoFiles) {
  const services = new Map();
  const duplicateServices = [];

  for (const file of protoFiles) {
    const text = readFileSync(file, 'utf8');
    const serviceMatches = text.matchAll(/service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g);

    for (const match of serviceMatches) {
      const service = match.groups.service;
      const body = match.groups.body;
      const methods = [...body.matchAll(/rpc\s+(?<method>[A-Za-z]\w*)\s*\(\s*(?<input>[A-Za-z]\w*)\s*\)\s*returns\s*\(\s*(?<output>[A-Za-z]\w*)\s*\)/g)].map(
        (methodMatch) => ({
          input: methodMatch.groups.input,
          method: methodMatch.groups.method,
          output: methodMatch.groups.output,
        })
      );
      if (services.has(service)) {
        duplicateServices.push({ service, file });
      }
      services.set(service, { file, methods });
    }
  }

  return { services, duplicateServices };
}

export function parseProtoMessages(protoFiles) {
  const messages = new Map();

  for (const file of protoFiles) {
    const text = readFileSync(file, 'utf8');
    const messageMatches = text.matchAll(/message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g);

    for (const match of messageMatches) {
      const message = match.groups.message;
      const fields = new Map();
      const fieldMatches = match.groups.body.matchAll(/(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=\s*(?<number>\d+)\s*;/g);
      for (const fieldMatch of fieldMatches) {
        fields.set(fieldMatch.groups.field, Number.parseInt(fieldMatch.groups.number, 10));
      }
      messages.set(message, { fields, file });
    }
  }

  return messages;
}

function parseProtoMessagesWithReserve(protoFiles) {
  const messages = new Map();

  for (const file of protoFiles) {
    const text = readFileSync(file, 'utf8');
    const messageMatches = text.matchAll(/message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g);

    for (const match of messageMatches) {
      const fieldsByName = new Map();
      const fieldsByNumber = new Map();
      const fieldMatches = match.groups.body.matchAll(/(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=\s*(?<number>\d+)\s*;/g);
      for (const fieldMatch of fieldMatches) {
        const field = {
          name: fieldMatch.groups.field,
          number: Number.parseInt(fieldMatch.groups.number, 10),
        };
        fieldsByName.set(field.name, field);
        fieldsByNumber.set(field.number, field);
      }
      messages.set(match.groups.message, {
        fieldsByName,
        fieldsByNumber,
        file,
        reservedNames: parseReservedFieldNames(match.groups.body),
        reservedNumberRanges: parseReservedFieldNumberRanges(match.groups.body),
      });
    }
  }

  return messages;
}

export function collectProtoFieldStabilityIssues(previousProtoFiles, currentProtoFiles) {
  const previousMessages = parseProtoMessagesWithReserve(previousProtoFiles);
  const currentMessages = parseProtoMessagesWithReserve(currentProtoFiles);
  const issues = [];

  for (const [message, previousDescriptor] of previousMessages) {
    const currentDescriptor = currentMessages.get(message);
    if (!currentDescriptor) {
      issues.push(`${message}: message removed without field reserve context`);
      continue;
    }

    for (const previousField of previousDescriptor.fieldsByName.values()) {
      const currentByName = currentDescriptor.fieldsByName.get(previousField.name);
      const currentByNumber = currentDescriptor.fieldsByNumber.get(previousField.number);
      const numberReserved = isReservedFieldNumber(previousField.number, currentDescriptor.reservedNumberRanges);
      const nameReserved = currentDescriptor.reservedNames.has(previousField.name);

      if (!currentByName && !currentByNumber && (!numberReserved || !nameReserved)) {
        issues.push(
          `${message}: removed field ${previousField.name} = ${previousField.number} is not reserved by number and name`
        );
        continue;
      }
      if (currentByName && currentByName.number !== previousField.number) {
        issues.push(`${message}: field ${previousField.name} moved from ${previousField.number} to ${currentByName.number}`);
      }
      if (currentByNumber && currentByNumber.name !== previousField.name) {
        issues.push(`${message}: field number ${previousField.number} reused for ${currentByNumber.name}`);
      }
    }
  }

  return issues;
}

export function collectProtoServiceIssues(protoFiles) {
  const issues = [];
  const { services, duplicateServices } = parseProtoServices(protoFiles);

  for (const duplicate of duplicateServices) {
    issues.push(`Duplicate RPC service ${duplicate.service} in ${relative(projectRoot, duplicate.file)}`);
  }

  for (const [service, { methods }] of services) {
    const seen = new Set();
    for (const methodDescriptor of methods) {
      if (seen.has(methodDescriptor.method)) {
        issues.push(`Duplicate RPC method ${service}.${methodDescriptor.method}`);
      }
      seen.add(methodDescriptor.method);
      if (forbiddenCrossAgentMethods.has(methodDescriptor.method)) {
        issues.push(`Forbidden Agent-cross RPC method ${service}.${methodDescriptor.method}`);
      }
    }
  }

  return issues;
}

export function collectTypeSpecFieldIssues(typeSpecFiles) {
  const issues = [];

  for (const file of typeSpecFiles) {
    const text = readFileSync(file, 'utf8');
    const modelMatches = text.matchAll(/model\s+(?<model>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g);

    for (const match of modelMatches) {
      const model = match.groups.model;
      const lines = match.groups.body.split('\n');
      const fieldNumbers = new Map();
      let pendingFieldNumber;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        const fieldMatch = trimmed.match(/@field\((?<number>\d+)\)/);
        if (trimmed.startsWith('@') && !trimmed.includes(':')) {
          pendingFieldNumber = fieldMatch?.groups.number ?? pendingFieldNumber;
          continue;
        }
        if (!trimmed.includes(':') || !trimmed.endsWith(';')) continue;
        const fieldNumber = fieldMatch?.groups.number ?? pendingFieldNumber;
        if (!fieldNumber) {
          issues.push(`${relative(projectRoot, file)}: ${model} field is missing @field(n): ${trimmed}`);
        } else if (fieldNumbers.has(fieldNumber)) {
          issues.push(
            `${relative(projectRoot, file)}: ${model} reuses @field(${fieldNumber}) for ${fieldNumbers.get(fieldNumber)} and ${trimmed}`
          );
        } else {
          fieldNumbers.set(fieldNumber, trimmed);
        }
        pendingFieldNumber = undefined;
      }
    }
  }

  return issues;
}

function parseReservedFieldNumberRanges(messageBody) {
  const ranges = [];
  const reservedMatches = messageBody.matchAll(/\breserved\s+(?<items>[^;]+);/g);

  for (const reservedMatch of reservedMatches) {
    const items = reservedMatch.groups.items;
    if (items.includes('"')) continue;

    for (const item of items.split(',')) {
      const trimmed = item.trim();
      const rangeMatch = trimmed.match(/^(?<start>\d+)\s+to\s+(?<end>\d+|max)$/);
      if (rangeMatch) {
        ranges.push({
          end: rangeMatch.groups.end === 'max' ? Number.POSITIVE_INFINITY : Number.parseInt(rangeMatch.groups.end, 10),
          start: Number.parseInt(rangeMatch.groups.start, 10),
        });
        continue;
      }
      if (/^\d+$/.test(trimmed)) {
        const number = Number.parseInt(trimmed, 10);
        ranges.push({ end: number, start: number });
      }
    }
  }

  return ranges;
}

function parseReservedFieldNames(messageBody) {
  const names = new Set();
  const reservedMatches = messageBody.matchAll(/\breserved\s+(?<items>[^;]*"[^;]+);/g);

  for (const reservedMatch of reservedMatches) {
    const nameMatches = reservedMatch.groups.items.matchAll(/"(?<name>[A-Z_a-z]\w*)"/g);
    for (const nameMatch of nameMatches) {
      names.add(nameMatch.groups.name);
    }
  }

  return names;
}

function isReservedFieldNumber(fieldNumber, reservedRanges) {
  return reservedRanges.some((range) => fieldNumber >= range.start && fieldNumber <= range.end);
}

export function collectProtoFieldIssues(protoFiles) {
  const issues = [];

  for (const file of protoFiles) {
    const text = readFileSync(file, 'utf8');
    const messageMatches = text.matchAll(/message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g);

    for (const match of messageMatches) {
      const message = match.groups.message;
      const fieldNumbers = new Map();
      const fieldNames = new Set();
      const reservedNumberRanges = parseReservedFieldNumberRanges(match.groups.body);
      const reservedNames = parseReservedFieldNames(match.groups.body);
      const fieldMatches = match.groups.body.matchAll(/(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=\s*(?<number>\d+)\s*;/g);
      for (const fieldMatch of fieldMatches) {
        const field = fieldMatch.groups.field;
        const number = fieldMatch.groups.number;
        const numericNumber = Number.parseInt(number, 10);
        if (fieldNumbers.has(number)) {
          issues.push(
            `${relative(projectRoot, file)}: ${message} reuses field number ${number} for ${fieldNumbers.get(number)} and ${field}`
          );
        }
        if (fieldNames.has(field)) {
          issues.push(`${relative(projectRoot, file)}: ${message} reuses field name ${field}`);
        }
        if (isReservedFieldNumber(numericNumber, reservedNumberRanges)) {
          issues.push(`${relative(projectRoot, file)}: ${message} field ${field} reuses reserved field number ${number}`);
        }
        if (reservedNames.has(field)) {
          issues.push(`${relative(projectRoot, file)}: ${message} field ${field} reuses reserved field name`);
        }
        fieldNumbers.set(number, field);
        fieldNames.add(field);
      }
    }
  }

  return issues;
}

export function collectRpcSchemaInvariantIssues(services, messages) {
  const issues = [];

  for (const [service, { methods }] of services) {
    for (const methodDescriptor of methods) {
      const fullMethodName = `${service}.${methodDescriptor.method}`;
      const inputMessage = messages.get(methodDescriptor.input);
      if (!inputMessage) {
        issues.push(`Missing request message ${methodDescriptor.input} for ${fullMethodName}`);
        continue;
      }
      if (!inputMessage.fields.has('agent_id')) {
        issues.push(`${methodDescriptor.input}: public Agent RPC request is missing agent_id for ${fullMethodName}`);
      }
      if (commandMethods.has(fullMethodName) && !inputMessage.fields.has('idempotency_key')) {
        issues.push(`${methodDescriptor.input}: command request is missing idempotency_key for ${fullMethodName}`);
      }
      if (eventPublishMethods.has(fullMethodName) && !inputMessage.fields.has('thread_key')) {
        issues.push(`${methodDescriptor.input}: event publish request is missing thread_key for ${fullMethodName}`);
      }
    }
  }

  return issues;
}

export function collectThreadKeyValidationIssues(typeSpecFiles) {
  const corpus = typeSpecFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
  const requiredTerms = [
    'ThreadKeyValidation',
    'ThreadKeyIdentityRule',
    'thread_key',
    'normalized_thread_key',
    'max_utf8_bytes',
    'case_sensitive',
    'implicit_prefix_forbidden',
  ];
  return requiredTerms
    .filter((term) => !corpus.includes(term))
    .map((term) => `Thread key validation metadata is missing ${term}`);
}

export function collectAgentCodegenIssues() {
  const issues = [];

  for (const openApiRoot of forbiddenOpenApiRoots) {
    if (existsSync(openApiRoot)) {
      issues.push(`Agent OpenAPI output is forbidden: ${relative(projectRoot, openApiRoot)}`);
    }
  }

  const protoFiles = listFiles(protoRoot, '.proto');
  const typeSpecFiles = listFiles(typeSpecRoot, '.tsp');
  const agentGeneratedFiles = listFiles(agentGeneratedRoot, '.ts');
  const clientGeneratedFiles = listFiles(clientGeneratedRoot, '.ts');

  if (protoFiles.length === 0) {
    issues.push(`Missing generated Agent proto output under ${relative(projectRoot, protoRoot)}`);
  }
  if (agentGeneratedFiles.length === 0) {
    issues.push(`Missing generated Agent RPC output under ${relative(projectRoot, agentGeneratedRoot)}`);
  }
  if (clientGeneratedFiles.length === 0) {
    issues.push(`Missing generated Client Agent RPC output under ${relative(projectRoot, clientGeneratedRoot)}`);
  }

  issues.push(...collectTypeSpecFieldIssues(typeSpecFiles));
  issues.push(...collectThreadKeyValidationIssues(typeSpecFiles));
  if (protoFiles.length === 0) {
    return issues;
  }
  issues.push(...collectProtoFieldIssues(protoFiles));

  const { services, duplicateServices } = parseProtoServices(protoFiles);
  const messages = parseProtoMessages(protoFiles);
  for (const duplicate of duplicateServices) {
    issues.push(`Duplicate RPC service ${duplicate.service} in ${relative(projectRoot, duplicate.file)}`);
  }
  for (const [service, methods] of rpcServiceInventory) {
    const found = services.get(service);
    if (!found) {
      issues.push(`Missing RPC service ${service}`);
      continue;
    }
    for (const method of methods) {
      if (!found.methods.some((methodDescriptor) => methodDescriptor.method === method)) {
        issues.push(`Missing RPC method ${service}.${method}`);
      }
    }
  }

  for (const [service, { methods }] of services) {
    const seen = new Set();
    for (const methodDescriptor of methods) {
      if (seen.has(methodDescriptor.method)) {
        issues.push(`Duplicate RPC method ${service}.${methodDescriptor.method}`);
      }
      seen.add(methodDescriptor.method);
      if (forbiddenCrossAgentMethods.has(methodDescriptor.method)) {
        issues.push(`Forbidden Agent-cross RPC method ${service}.${methodDescriptor.method}`);
      }
    }
  }

  issues.push(...collectRpcSchemaInvariantIssues(services, messages));

  return issues;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const issues = collectAgentCodegenIssues();

  if (issues.length > 0) {
    process.stderr.write(`Agent codegen guard failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}
