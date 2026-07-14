import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const typeSpecRoot = `${projectRoot}/packages/agent/src/typespec`;
const protoRoot = `${projectRoot}/packages/agent/proto`;
const agentGeneratedRoot = `${projectRoot}/packages/agent/src/generated/rpc`;
const clientGeneratedRoot = `${projectRoot}/packages/client/src/generated/agent-rpc`;
const sdkGeneratedRoot = `${projectRoot}/packages/sdk/src/generated/agent-rpc`;
const protoFieldStabilityBaselinePath = `${projectRoot}/scripts/codegen/agent-proto-field-stability-baseline.json`;
// 同一の Agent proto を入力にする descriptor 出力先を一元化し、生成先の追加漏れを防ぎます。
// 各 root は読み取り専用の検査対象であり、この script 自体は生成物を変更しません。
const generatedDescriptorTargets = [
  {
    label: 'Agent',
    missingMessage: 'Missing generated Agent RPC output',
    root: agentGeneratedRoot,
  },
  {
    label: 'Client',
    missingMessage: 'Missing generated Client Agent RPC output',
    root: clientGeneratedRoot,
  },
  {
    label: 'SDK',
    missingMessage: 'Missing generated SDK Agent RPC output',
    root: sdkGeneratedRoot,
  },
];
const forbiddenOpenApiRoots = [
  `${projectRoot}/packages/agent/openapi`,
  `${projectRoot}/packages/agent/src/typespec/openapi`,
  `${projectRoot}/packages/agent/src/generated/openapi`,
];
const emptyProtoFieldStabilitySnapshot = Object.freeze([]);

export const rpcServiceInventory = new Map([
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

const modelPolicyFieldStability = new Map([
  [
    'AgentModelPolicy',
    new Map([
      ['agent_id', 1],
      ['policy_ref', 2],
      ['version', 3],
      ['status', 4],
      ['provider', 5],
      ['model_id', 6],
      ['decision_schema_version', 7],
      ['policy_digest', 8],
    ]),
  ],
  [
    'AgentModelPolicySummary',
    new Map([
      ['agent_id', 1],
      ['policy_ref', 2],
      ['version', 3],
      ['status', 4],
      ['provider', 5],
      ['model_id', 6],
      ['policy_digest', 7],
      ['decision_schema_version', 8],
    ]),
  ],
  [
    'RunModelPolicySnapshot',
    new Map([
      ['requested_policy_ref', 1],
      ['resolved_policy_ref', 2],
      ['resolved_policy_digest', 3],
      ['provider', 4],
      ['model_id', 5],
      ['policy_version', 6],
      ['policy_source', 7],
      ['decision_schema_version', 8],
    ]),
  ],
]);

const modelPolicyResponseMessages = new Set([
  'AgentModelPolicy',
  'AgentModelPolicySummary',
  'AgentModelPolicyValidationResult',
  'ModelPolicyValidationIssue',
  'UpsertModelPolicyResponse',
  'GetModelPolicyResponse',
  'ListModelPoliciesResponse',
  'ArchiveModelPolicyResponse',
  'ValidateModelPolicyResponse',
]);

const forbiddenModelPolicyResponseFieldPattern =
  /credential|secret|raw_?prompt|raw_?completion|raw_?reasoning|reasoning/i;

function listFiles(root, suffix) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => `${entry.parentPath}/${entry.name}`)
    .sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
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

export function collectGeneratedTreeDriftIssues(
  expectedFiles,
  actualFiles,
  label = 'generated output'
) {
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

/**
 * Agent descriptor を正本として、別 package の generated descriptor が同一 contract を表すか検査します。
 * 入力は Agent descriptor の snapshot と対象 root/snapshot、出力は root・再生成 command・差分 file を含む report です。
 * この関数は snapshot を比較するだけで、いかなる generated file も作成・更新しません。
 */
export function collectGeneratedDescriptorParityIssues(
  expectedFiles,
  actualRoot,
  actualFiles,
  targetLabel
) {
  return collectGeneratedTreeDriftIssues(
    expectedFiles,
    actualFiles,
    `${targetLabel} Agent RPC descriptor parity under ${relative(projectRoot, actualRoot)} (run pnpm gen:agent:rpc)`
  );
}

/**
 * Agent codegen contract と generated descriptor 出力を一度だけ走査し、後続 collector が共有する入力 snapshot を作成します。
 * 入力は固定された TypeSpec/proto/Agent/Client/SDK root、出力は変更不能な file list と descriptor snapshot です。
 * 収集処理はファイルを読み取るだけで、command-owned generated output を作成、更新、削除しません。
 */
export function collectAgentCodegenInputs() {
  // descriptor root ごとに一度だけ tree snapshot を作成し、missing 判定と parity 判定で同じ観測結果を共有します。
  const descriptorSnapshots = generatedDescriptorTargets.map((target) => {
    const snapshot = snapshotGeneratedTree(target.root, ['.ts']);

    return Object.freeze({
      ...target,
      // snapshot key は既に正規化済みの相対 path であるため、file 数の判定に再度 filesystem を走査しません。
      files: Object.freeze([...snapshot.keys()]),
      snapshot,
    });
  });

  // contract source は path list を固定して後続 collector に渡し、top-level collector 内の再列挙を防ぎます。
  return Object.freeze({
    descriptorSnapshots: Object.freeze(descriptorSnapshots),
    // 承認済み baseline は main collector ごとに一度だけ読み、生成後の proto と同じ観測単位で比較します。
    previousProtoFieldStabilitySnapshot: readProtoFieldStabilityBaseline(),
    protoFiles: Object.freeze(listFiles(protoRoot, '.proto')),
    typeSpecFiles: Object.freeze(listFiles(typeSpecRoot, '.tsp')),
  });
}

/**
 * Agent public contract に許可されない surface が生成されていないかを検査します。
 * 入力は禁止 contract surface root の配列、出力は利用者が削除対象を特定できる path 付き issue です。
 * 読み取り専用の存在確認だけを行い、API contract または生成物へ副作用を与えません。
 */
export function collectContractSurfacePolicyIssues(contractSurfaceRoots = forbiddenOpenApiRoots) {
  const issues = [];

  for (const openApiRoot of contractSurfaceRoots) {
    if (existsSync(openApiRoot)) {
      issues.push(`Agent OpenAPI output is forbidden: ${relative(projectRoot, openApiRoot)}`);
    }
  }

  return issues;
}

/**
 * proto と Agent/Client/SDK descriptor snapshot の生成・欠落・parity policy を固定順で検査します。
 * 入力は proto path list と一度収集済みの descriptor snapshot、出力は root と再生成 command を含む issue です。
 * snapshot の比較だけを行い、generated output への書き込みや generation command の実行は行いません。
 */
export function collectGeneratedOutputIssues(protoFiles, descriptorSnapshots) {
  const issues = [];

  // 最初に proto root を報告し、続けて Agent、Client、SDK root の順で必須 descriptor output を報告します。
  if (protoFiles.length === 0) {
    issues.push(`Missing generated Agent proto output under ${relative(projectRoot, protoRoot)}`);
  }
  for (const descriptorTarget of descriptorSnapshots) {
    if (descriptorTarget.files.length === 0) {
      issues.push(
        `${descriptorTarget.missingMessage} under ${relative(projectRoot, descriptorTarget.root)}; run pnpm gen:agent:rpc`
      );
    }
  }

  // Agent descriptor を正本にし、存在する Client、SDK descriptor だけを Agent→Client、Agent→SDK の順で比較します。
  const agentDescriptorSnapshot = descriptorSnapshots.find(
    (descriptorTarget) => descriptorTarget.label === 'Agent'
  );
  if (agentDescriptorSnapshot?.files.length !== 0) {
    for (const descriptorTarget of descriptorSnapshots) {
      if (descriptorTarget.label === 'Agent' || descriptorTarget.files.length === 0) {
        continue;
      }
      issues.push(
        ...collectGeneratedDescriptorParityIssues(
          agentDescriptorSnapshot.snapshot,
          descriptorTarget.root,
          descriptorTarget.snapshot,
          descriptorTarget.label
        )
      );
    }
  }

  return issues;
}

/**
 * TypeSpec contract の field numbering と thread-key metadata を検査します。
 * 入力は一度収集済みの TypeSpec path list、出力は TypeSpec contract 違反を発見順に並べた issue です。
 * parser は source を読むだけで、TypeSpec source、proto、descriptor を変更しません。
 */
export function collectTypeSpecContractIssues(typeSpecFiles) {
  return [
    ...collectTypeSpecFieldIssues(typeSpecFiles),
    ...collectThreadKeyValidationIssues(typeSpecFiles),
  ];
}

export function parseProtoServices(protoFiles) {
  const services = new Map();
  const duplicateServices = [];

  for (const file of protoFiles) {
    const text = readFileSync(file, 'utf8');
    const serviceMatches = text.matchAll(
      /service\s+(?<service>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
    );

    for (const match of serviceMatches) {
      const service = match.groups.service;
      const body = match.groups.body;
      const methods = [
        ...body.matchAll(
          /rpc\s+(?<method>[A-Za-z]\w*)\s*\(\s*(?<input>[A-Za-z]\w*)\s*\)\s*returns\s*\(\s*(?<output>[A-Za-z]\w*)\s*\)/g
        ),
      ].map((methodMatch) => ({
        input: methodMatch.groups.input,
        method: methodMatch.groups.method,
        output: methodMatch.groups.output,
      }));
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
    const messageMatches = text.matchAll(
      /message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
    );

    for (const match of messageMatches) {
      const message = match.groups.message;
      const fields = new Map();
      const fieldMatches = match.groups.body.matchAll(
        /(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=\s*(?<number>\d+)\s*;/g
      );
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
    const messageMatches = text.matchAll(
      /message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
    );

    for (const match of messageMatches) {
      const fieldsByName = new Map();
      const fieldsByNumber = new Map();
      const fieldMatches = match.groups.body.matchAll(
        /(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=\s*(?<number>\d+)\s*;/g
      );
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
  return collectProtoFieldStabilityIssuesFromMessages(previousMessages, currentMessages);
}

/**
 * checked-in の承認済み baseline を、collector 間で共有できる不変 snapshot に変換します。
 * 入力は message 名ごとの `[fieldName, fieldNumber]` 配列、出力は message/field 名と番号を正規順に固定した凍結配列です。
 * JSON の入力配列を変更せず、後続比較用の mutable Map はこの snapshot から処理ごとに生成します。
 */
function createProtoFieldStabilitySnapshot(messages) {
  return Object.freeze(
    Object.entries(messages)
      .map(([message, fields]) =>
        Object.freeze({
          fields: Object.freeze(
            fields
              .map(([name, number]) => Object.freeze({ name, number }))
              .sort(
                (leftField, rightField) =>
                  leftField.number - rightField.number ||
                  leftField.name.localeCompare(rightField.name)
              )
          ),
          message,
        })
      )
      .sort((leftMessage, rightMessage) => leftMessage.message.localeCompare(rightMessage.message))
  );
}

/**
 * 固定された承認済み JSON baseline を一度だけ読み込み、不変の field stability snapshot として返します。
 * 入力は repository 内で review される baseline file、出力は main collector が共有する凍結 snapshot です。
 * 読み取り専用のため、proto、TypeSpec、generated descriptor を変更しません。
 */
function readProtoFieldStabilityBaseline() {
  const baseline = JSON.parse(readFileSync(protoFieldStabilityBaselinePath, 'utf8'));
  return createProtoFieldStabilitySnapshot(baseline.messages);
}

/**
 * 不変 baseline snapshot を一時的な比較 descriptor に復元します。
 * 入力は凍結済みの message/field snapshot、出力は field name/number を双方向に引ける処理ローカル Map です。
 * Map はこの関数の戻り値を利用する比較処理だけが所有し、checked-in baseline を変更しません。
 */
function materializeProtoFieldStabilitySnapshot(previousSnapshot) {
  const messages = new Map();

  for (const { fields, message } of previousSnapshot) {
    const fieldsByName = new Map();
    const fieldsByNumber = new Map();
    for (const field of fields) {
      fieldsByName.set(field.name, field);
      fieldsByNumber.set(field.number, field);
    }
    messages.set(message, {
      fieldsByName,
      fieldsByNumber,
      reservedNames: new Set(),
      reservedNumberRanges: [],
    });
  }

  return messages;
}

/**
 * 現行 public RPC request がすべて承認済み baseline に含まれることを検査します。
 * 入力は現行 service descriptor と一度だけ読み込んだ不変 baseline、出力は不足 request を message 名順に並べた issue 配列です。
 * baseline を明示しない unit fixture では既存の局所検査を維持するため、coverage issue を追加しません。
 */
function collectPublicRequestBaselineCoverageIssues(services, previousSnapshot) {
  if (previousSnapshot.length === 0) {
    return [];
  }

  const baselineMessages = new Set(previousSnapshot.map(({ message }) => message));
  const publicRequestMessages = new Set();
  for (const { methods } of services.values()) {
    for (const { input } of methods) {
      publicRequestMessages.add(input);
    }
  }

  return [...publicRequestMessages]
    .sort((leftMessage, rightMessage) => leftMessage.localeCompare(rightMessage))
    .filter((message) => !baselineMessages.has(message))
    .map(
      (message) =>
        `${message}: public Agent RPC request is missing approved Protobuf field stability baseline`
    );
}

function collectProtoFieldStabilitySnapshotIssues(previousSnapshot, currentMessages) {
  return collectProtoFieldStabilityIssuesFromMessages(
    materializeProtoFieldStabilitySnapshot(previousSnapshot),
    currentMessages
  );
}

function collectProtoFieldStabilityIssuesFromMessages(previousMessages, currentMessages) {
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
      const numberReserved = isReservedFieldNumber(
        previousField.number,
        currentDescriptor.reservedNumberRanges
      );
      const nameReserved = currentDescriptor.reservedNames.has(previousField.name);

      if (!currentByName && !currentByNumber && (!numberReserved || !nameReserved)) {
        issues.push(
          `${message}: removed field ${previousField.name} = ${previousField.number} is not reserved by number and name`
        );
        continue;
      }
      if (currentByName && currentByName.number !== previousField.number) {
        issues.push(
          `${message}: field ${previousField.name} moved from ${previousField.number} to ${currentByName.number}`
        );
      }
      if (currentByNumber && currentByNumber.name !== previousField.name) {
        issues.push(
          `${message}: field number ${previousField.number} reused for ${currentByNumber.name}`
        );
      }
    }
  }

  return issues;
}

/**
 * proto service snapshot から service 重複と method policy 違反を検査します。
 * 入力は proto path list、出力は service policy に限定した issue 配列です。
 * proto source の解析結果を読むだけで、source や generated descriptor を変更しません。
 */
export function collectProtoServiceIssues(protoFiles) {
  const { services, duplicateServices } = parseProtoServices(protoFiles);

  return [
    ...collectDuplicateProtoServiceIssues(duplicateServices),
    ...collectProtoMethodPolicyIssues(services),
  ];
}

/**
 * 同一 service 名の重複定義を path 付き issue に正規化します。
 * 入力は `parseProtoServices` の duplicate service list、出力は発見順を保つ issue 配列です。
 * 引数の配列を読み取るだけで、service descriptor や proto file に副作用を与えません。
 */
function collectDuplicateProtoServiceIssues(duplicateServices) {
  const issues = [];

  for (const duplicate of duplicateServices) {
    issues.push(
      `Duplicate RPC service ${duplicate.service} in ${relative(projectRoot, duplicate.file)}`
    );
  }

  return issues;
}

/**
 * service 内 method の重複と禁止された Agent-cross method 名を検査します。
 * 入力は service descriptor map、出力は method policy 違反を service ごとの解析順で並べた issue 配列です。
 * 一時的な Set だけを生成し、入力 descriptor や contract source を変更しません。
 */
function collectProtoMethodPolicyIssues(services) {
  const issues = [];

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

/**
 * 正式な RPC service/method inventory が proto descriptor に残っていることを検査します。
 * 入力は service descriptor map、出力は欠落した service または method を示す issue 配列です。
 * inventory と descriptor の照合のみを行い、API contract や generated output へ副作用を与えません。
 */
function collectRequiredRpcInventoryIssues(services) {
  const issues = [];

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
          issues.push(
            `${relative(projectRoot, file)}: ${model} field is missing @field(n): ${trimmed}`
          );
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
          end:
            rangeMatch.groups.end === 'max'
              ? Number.POSITIVE_INFINITY
              : Number.parseInt(rangeMatch.groups.end, 10),
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
    const messageMatches = text.matchAll(
      /message\s+(?<message>[A-Za-z]\w*)\s*{(?<body>[\S\s]*?)\n}/g
    );

    for (const match of messageMatches) {
      const message = match.groups.message;
      const fieldNumbers = new Map();
      const fieldNames = new Set();
      const reservedNumberRanges = parseReservedFieldNumberRanges(match.groups.body);
      const reservedNames = parseReservedFieldNames(match.groups.body);
      const fieldMatches = match.groups.body.matchAll(
        /(?:optional\s+)?[A-Za-z][\w.<>]*\s+(?<field>[A-Z_a-z]\w*)\s*=\s*(?<number>\d+)\s*;/g
      );
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
          issues.push(
            `${relative(projectRoot, file)}: ${message} field ${field} reuses reserved field number ${number}`
          );
        }
        if (reservedNames.has(field)) {
          issues.push(
            `${relative(projectRoot, file)}: ${message} field ${field} reuses reserved field name`
          );
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
        issues.push(
          `${methodDescriptor.input}: public Agent RPC request is missing agent_id for ${fullMethodName}`
        );
      }
      if (commandMethods.has(fullMethodName) && !inputMessage.fields.has('idempotency_key')) {
        issues.push(
          `${methodDescriptor.input}: command request is missing idempotency_key for ${fullMethodName}`
        );
      }
      if (eventPublishMethods.has(fullMethodName) && !inputMessage.fields.has('thread_key')) {
        issues.push(
          `${methodDescriptor.input}: event publish request is missing thread_key for ${fullMethodName}`
        );
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

function collectModelPolicySchemaIssues(services, messages) {
  const issues = [];
  const service = services.get('AgentModelPolicyService');

  // Agent model policy contract は下流 runtime/client の合流点なので、
  // service/method/request/response の基本形を codegen guard でも固定します。
  if (service !== undefined) {
    const requestMessages = new Map(service.methods.map((method) => [method.method, method.input]));
    for (const [method, requestMessage] of requestMessages) {
      const requestFields = messages.get(requestMessage)?.fields;
      if (requestFields === undefined) {
        issues.push(
          `${requestMessage}: missing AgentModelPolicyService request message for ${method}`
        );
        continue;
      }
      if (!requestFields.has('agent_id')) {
        issues.push(`${requestMessage}: model policy request is missing agent_id for ${method}`);
      }
    }
  }

  for (const [messageName, requiredFields] of modelPolicyFieldStability) {
    const message = messages.get(messageName);
    if (message === undefined) {
      issues.push(`${messageName}: required model policy message is missing`);
      continue;
    }
    for (const [fieldName, fieldNumber] of requiredFields) {
      if (message.fields.get(fieldName) !== fieldNumber) {
        issues.push(
          `${messageName}: required field ${fieldName} must stay at number ${fieldNumber}`
        );
      }
    }
  }

  for (const responseMessage of modelPolicyResponseMessages) {
    const message = messages.get(responseMessage);
    if (message === undefined) {
      issues.push(`${responseMessage}: model policy response schema is missing`);
      continue;
    }
    for (const fieldName of message.fields.keys()) {
      if (forbiddenModelPolicyResponseFieldPattern.test(fieldName)) {
        issues.push(
          `${responseMessage}: secret-bearing field is forbidden in model policy response schema: ${fieldName}`
        );
      }
    }
  }

  return issues;
}

/**
 * proto contract の field、service、method、RPC schema、model-policy invariant を固定順で検査します。
 * 入力は一度収集済みの proto path list、出力は後続 report の順序を保った issue 配列です。
 * 空 snapshot は report を追加せず空配列を返し、proto source や generated descriptor を変更しません。
 */
export function collectProtoContractIssues(
  protoFiles,
  previousProtoFieldStabilitySnapshot = emptyProtoFieldStabilitySnapshot
) {
  if (protoFiles.length === 0) {
    return [];
  }

  const { services, duplicateServices } = parseProtoServices(protoFiles);
  const messages = parseProtoMessages(protoFiles);
  const messagesWithReserve = parseProtoMessagesWithReserve(protoFiles);

  return [
    ...collectProtoFieldIssues(protoFiles),
    ...collectPublicRequestBaselineCoverageIssues(services, previousProtoFieldStabilitySnapshot),
    ...collectProtoFieldStabilitySnapshotIssues(
      previousProtoFieldStabilitySnapshot,
      messagesWithReserve
    ),
    ...collectDuplicateProtoServiceIssues(duplicateServices),
    ...collectRequiredRpcInventoryIssues(services),
    ...collectProtoMethodPolicyIssues(services),
    ...collectRpcSchemaInvariantIssues(services, messages),
    ...collectModelPolicySchemaIssues(services, messages),
  ];
}

/**
 * Agent codegen guard の全 issue collector を責務ごとの固定順で合成します。
 * 入力は repository root から一度収集する contract/generated snapshot、出力は deterministic な validation report です。
 * 収集・比較のみを行うため、TypeSpec、proto、Agent/Client/SDK descriptor のいずれにも副作用を与えません。
 */
export function collectAgentCodegenIssues(inputs = collectAgentCodegenInputs()) {
  return [
    ...collectContractSurfacePolicyIssues(),
    ...collectGeneratedOutputIssues(inputs.protoFiles, inputs.descriptorSnapshots),
    ...collectTypeSpecContractIssues(inputs.typeSpecFiles),
    ...collectProtoContractIssues(inputs.protoFiles, inputs.previousProtoFieldStabilitySnapshot),
  ];
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const issues = collectAgentCodegenIssues();

  if (issues.length > 0) {
    process.stderr.write(
      `Agent codegen guard failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`
    );
    process.exitCode = 1;
  }
}
