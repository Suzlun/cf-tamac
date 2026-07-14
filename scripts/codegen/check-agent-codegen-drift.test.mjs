import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectAgentCodegenInputs,
  collectAgentCodegenIssues,
  collectContractSurfacePolicyIssues,
  collectGeneratedDescriptorParityIssues,
  collectGeneratedOutputIssues,
  collectGeneratedTreeDriftIssues,
  collectProtoContractIssues,
  collectProtoFieldIssues,
  collectProtoFieldStabilityIssues,
  collectProtoServiceIssues,
  collectTypeSpecContractIssues,
  collectTypeSpecFieldIssues,
  rpcServiceInventory,
  snapshotGeneratedTree,
} from './check-agent-codegen-drift.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const protoRoot = fileURLToPath(new URL('../../packages/agent/proto/', import.meta.url));
const agentGeneratedRoot = fileURLToPath(
  new URL('../../packages/agent/src/generated/rpc/', import.meta.url)
);
const clientGeneratedRoot = fileURLToPath(
  new URL('../../packages/client/src/generated/agent-rpc/', import.meta.url)
);
const sdkGeneratedRoot = fileURLToPath(
  new URL('../../packages/sdk/src/generated/agent-rpc/', import.meta.url)
);
const agentProtoPath = join(protoRoot, 'cftamac/agent/v1.proto');

function runAgentGeneration() {
  execFileSync('pnpm', ['gen:agent:proto'], { cwd: projectRoot, stdio: 'pipe', timeout: 120_000 });
  execFileSync('pnpm', ['gen:agent:rpc'], { cwd: projectRoot, stdio: 'pipe', timeout: 120_000 });
}

function hashSnapshot(snapshots) {
  const hash = createHash('sha256');
  for (const snapshot of snapshots) {
    for (const [file, content] of snapshot) {
      hash.update(file);
      hash.update('\0');
      hash.update(content);
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

function writeFixture(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

/**
 * 指定した proto message の範囲だけで field declaration を置換し、provider request の破壊的変更 fixture を作ります。
 * 入力は generated proto text、message 名、置換前後の field declaration、出力は指定 message だけを変更した proto text です。
 * message または対象 field が存在しない場合は fixture 自体が不正であるため例外にし、実 repository の generated file は変更しません。
 */
function replaceProtoMessageField(proto, message, currentDeclaration, replacementDeclaration) {
  const messageStart = proto.indexOf(`message ${message} {\n`);
  const messageEnd = proto.indexOf('\n}', messageStart);
  const fieldStart = proto.indexOf(currentDeclaration, messageStart);

  if (messageStart === -1 || messageEnd === -1 || fieldStart === -1 || fieldStart > messageEnd) {
    throw new Error(`Fixture field ${currentDeclaration} was not found in ${message}`);
  }

  return `${proto.slice(0, fieldStart)}${replacementDeclaration}${proto.slice(
    fieldStart + currentDeclaration.length
  )}`;
}

/**
 * main codegen collector に provider request の field mutation を注入して、承認済み baseline との比較結果を取得します。
 * 入力は一度収集した不変 codegen inputs と provider request の field mutation、出力は `collectAgentCodegenIssues` の issue 配列です。
 * 一時 directory は必ず削除し、checked-in proto、descriptor、baseline には副作用を与えません。
 */
function collectMainCollectorIssuesForProviderFieldMutation(
  inputs,
  message,
  currentDeclaration,
  replacementDeclaration
) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-codegen-provider-field-stability-'));

  try {
    const mutatedProto = replaceProtoMessageField(
      readFileSync(agentProtoPath, 'utf8'),
      message,
      currentDeclaration,
      replacementDeclaration
    );
    const protoFile = writeFixture(fixtureRoot, 'cftamac/agent/v1.proto', mutatedProto);

    // baseline は同一 input snapshot をそのまま共有し、fixture では current proto だけを差し替えます。
    return collectAgentCodegenIssues(
      Object.freeze({ ...inputs, protoFiles: Object.freeze([protoFile]) })
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

const previousProto = `syntax = "proto3";
package cftamac.agent.v1;

message StableRequest {
  string agent_id = 1;
  string display_name = 2;
}

message StableResponse {
  string agent_id = 1;
}

service StableService {
  rpc Get(StableRequest) returns (StableResponse);
}
`;

const stableCurrentProto = `syntax = "proto3";
package cftamac.agent.v1;

message StableRequest {
  reserved 2;
  reserved "display_name";
  string agent_id = 1;
  string title = 3;
}

message StableResponse {
  string agent_id = 1;
}

service StableService {
  rpc Get(StableRequest) returns (StableResponse);
}
`;

describe('Agent codegen governance', () => {
  it('[WORKSPACE-GOVERNANCE-S001] Root generation commands produce deterministic Agent outputs', () => {
    runAgentGeneration();
    const firstHash = hashSnapshot([
      snapshotGeneratedTree(protoRoot, ['.proto']),
      snapshotGeneratedTree(agentGeneratedRoot, ['.ts']),
      snapshotGeneratedTree(clientGeneratedRoot, ['.ts']),
      snapshotGeneratedTree(sdkGeneratedRoot, ['.ts']),
    ]);
    expect(collectAgentCodegenIssues()).toEqual([]);

    runAgentGeneration();
    const secondHash = hashSnapshot([
      snapshotGeneratedTree(protoRoot, ['.proto']),
      snapshotGeneratedTree(agentGeneratedRoot, ['.ts']),
      snapshotGeneratedTree(clientGeneratedRoot, ['.ts']),
      snapshotGeneratedTree(sdkGeneratedRoot, ['.ts']),
    ]);

    expect(secondHash).toBe(firstHash);
    expect([...rpcServiceInventory.keys()]).toContain('IntegrationIngressService');
    expect([...rpcServiceInventory.keys()]).toContain('IntegrationToolService');
    expect([...rpcServiceInventory.keys()]).toContain('IntegrationDeliveryService');
    expect(collectAgentCodegenIssues()).toEqual([]);
  }, 300_000);

  it('[WORKSPACE-GOVERNANCE-S002] Codegen check fails on Agent generated drift', () => {
    const expected = new Map([
      ['cftamac/agent/v1.proto', 'syntax = "proto3";\npackage cftamac.agent.v1;\n'],
      ['cftamac/agent/v1_pb.ts', 'export const file_cftamac_agent_v1 = {};\n'],
    ]);
    const actual = new Map(expected);
    actual.set('cftamac/agent/v1.proto', 'syntax = "proto3";\npackage drifted.agent.v1;\n');
    actual.set('cftamac/agent/v1_extra_pb.ts', 'export {};\n');

    expect(collectGeneratedTreeDriftIssues(expected, actual, 'Agent generated output')).toEqual([
      'Agent generated output: drifted cftamac/agent/v1.proto',
      'Agent generated output: unexpected cftamac/agent/v1_extra_pb.ts',
    ]);
  });

  it('[WORKSPACE-GOVERNANCE-S016] Codegen drift check が SDK Agent RPC descriptors を検査する', () => {
    // 実 root から一度だけ集めた immutable input が、design で固定した Agent/Client/SDK 順を保持することを確認します。
    // この確認は filesystem の読み取りだけを行い、command-owned descriptor を変更しません。
    const inputs = collectAgentCodegenInputs();
    expect(Object.isFrozen(inputs)).toBe(true);
    expect(inputs.descriptorSnapshots.map((target) => target.label)).toEqual([
      'Agent',
      'Client',
      'SDK',
    ]);
    expect(collectContractSurfacePolicyIssues()).toEqual([]);
    expect(collectTypeSpecContractIssues(inputs.typeSpecFiles)).toEqual([]);
    expect(collectProtoContractIssues([])).toEqual([]);
    expect(
      collectProtoContractIssues(inputs.protoFiles, inputs.previousProtoFieldStabilitySnapshot)
    ).toEqual([]);

    // Agent/Client descriptor が存在し SDK root だけが欠ける場合、root と pnpm gen:agent:rpc の復旧文脈を必ず報告します。
    const expected = new Map([
      ['cftamac/agent/v1_pb.ts', 'export const file_cftamac_agent_v1 = {};\n'],
    ]);
    const descriptorSnapshots = [
      {
        files: Object.freeze([...expected.keys()]),
        label: 'Agent',
        missingMessage: 'Missing generated Agent RPC output',
        root: agentGeneratedRoot,
        snapshot: expected,
      },
      {
        files: Object.freeze([...expected.keys()]),
        label: 'Client',
        missingMessage: 'Missing generated Client Agent RPC output',
        root: clientGeneratedRoot,
        snapshot: expected,
      },
      {
        files: Object.freeze([]),
        label: 'SDK',
        missingMessage: 'Missing generated SDK Agent RPC output',
        root: sdkGeneratedRoot,
        snapshot: new Map(),
      },
    ];

    expect(
      collectGeneratedOutputIssues(
        ['packages/agent/proto/cftamac/agent/v1.proto'],
        descriptorSnapshots
      )
    ).toEqual([
      'Missing generated SDK Agent RPC output under packages/sdk/src/generated/agent-rpc; run pnpm gen:agent:rpc',
    ]);

    // SDK snapshot に同名 drift と余分な file を置き、Agent→SDK parity report が rule/path/command context を失わないことを検証します。
    const actual = new Map(expected);
    actual.set(
      'cftamac/agent/v1_pb.ts',
      'export const file_cftamac_agent_v1 = { drifted: true };\n'
    );
    actual.set('cftamac/agent/v1_extra_pb.ts', 'export {};\n');
    descriptorSnapshots[2] = {
      ...descriptorSnapshots[2],
      files: Object.freeze([...actual.keys()]),
      snapshot: actual,
    };

    expect(
      collectGeneratedDescriptorParityIssues(expected, sdkGeneratedRoot, actual, 'SDK')
    ).toEqual([
      'SDK Agent RPC descriptor parity under packages/sdk/src/generated/agent-rpc (run pnpm gen:agent:rpc): drifted cftamac/agent/v1_pb.ts',
      'SDK Agent RPC descriptor parity under packages/sdk/src/generated/agent-rpc (run pnpm gen:agent:rpc): unexpected cftamac/agent/v1_extra_pb.ts',
    ]);
    expect(
      collectGeneratedOutputIssues(
        ['packages/agent/proto/cftamac/agent/v1.proto'],
        descriptorSnapshots
      )
    ).toEqual([
      'SDK Agent RPC descriptor parity under packages/sdk/src/generated/agent-rpc (run pnpm gen:agent:rpc): drifted cftamac/agent/v1_pb.ts',
      'SDK Agent RPC descriptor parity under packages/sdk/src/generated/agent-rpc (run pnpm gen:agent:rpc): unexpected cftamac/agent/v1_extra_pb.ts',
    ]);
  });

  it('[WORKSPACE-GOVERNANCE-S009] Protobuf field stability guard rejects unstable descriptors', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'agent-codegen-fixtures-'));

    try {
      const previousProtoPath = writeFixture(fixtureRoot, 'previous.proto', previousProto);
      const stableProtoPath = writeFixture(fixtureRoot, 'stable.proto', stableCurrentProto);
      const missingReserveProtoPath = writeFixture(
        fixtureRoot,
        'missing-reserve.proto',
        `syntax = "proto3";
package cftamac.agent.v1;

message StableRequest {
  string agent_id = 1;
  string title = 3;
}
`
      );
      const reusedFieldProtoPath = writeFixture(
        fixtureRoot,
        'reused-field.proto',
        `syntax = "proto3";
package cftamac.agent.v1;

message StableRequest {
  string agent_id = 1;
  string title = 2;
}

message BrokenRequest {
  string agent_id = 1;
  string display_name = 1;
}
`
      );
      const duplicateServiceProtoPath = writeFixture(
        fixtureRoot,
        'duplicate-service.proto',
        `syntax = "proto3";
package cftamac.agent.v1;

message DuplicateRequest {
  string agent_id = 1;
}

message DuplicateResponse {
  string agent_id = 1;
}

service MethodDuplicateService {
  rpc Get(DuplicateRequest) returns (DuplicateResponse);
  rpc Get(DuplicateRequest) returns (DuplicateResponse);
}

service ServiceDuplicate {
  rpc One(DuplicateRequest) returns (DuplicateResponse);
}

service ServiceDuplicate {
  rpc Two(DuplicateRequest) returns (DuplicateResponse);
}
`
      );
      const brokenTypeSpecPath = writeFixture(
        fixtureRoot,
        'broken.tsp',
        `model BrokenRequest {
  agent_id: string;
}
`
      );

      expect(collectProtoFieldIssues([stableProtoPath])).toEqual([]);
      expect(collectProtoFieldStabilityIssues([previousProtoPath], [stableProtoPath])).toEqual([]);
      expect(collectProtoServiceIssues([stableProtoPath])).toEqual([]);

      const unstableIssues = [
        ...collectTypeSpecFieldIssues([brokenTypeSpecPath]),
        ...collectProtoFieldIssues([reusedFieldProtoPath]),
        ...collectProtoFieldStabilityIssues([previousProtoPath], [missingReserveProtoPath]),
        ...collectProtoFieldStabilityIssues([previousProtoPath], [reusedFieldProtoPath]),
        ...collectProtoServiceIssues([duplicateServiceProtoPath]),
      ];

      expect(unstableIssues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('missing @field(n)'),
          expect.stringContaining('reuses field number 1'),
          expect.stringContaining('is not reserved by number and name'),
          expect.stringContaining('field number 2 reused for title'),
          expect.stringContaining('Duplicate RPC method MethodDuplicateService.Get'),
          expect.stringContaining('Duplicate RPC service ServiceDuplicate'),
        ])
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('[WORKSPACE-GOVERNANCE-S009] pnpm check:codegen の main collector は全 public request の承認済み不変 baseline を使う', () => {
    const inputs = collectAgentCodegenInputs();
    const toolResultRequest = inputs.previousProtoFieldStabilitySnapshot.find(
      ({ message }) => message === 'PublishToolResultRequest'
    );
    const deliveryResultRequest = inputs.previousProtoFieldStabilitySnapshot.find(
      ({ message }) => message === 'PublishDeliveryResultRequest'
    );

    // baseline と各 entry は凍結され、main collector が一度だけ読んだ承認済み state を後続検査で共有します。
    expect(Object.isFrozen(inputs.previousProtoFieldStabilitySnapshot)).toBe(true);
    expect(Object.isFrozen(toolResultRequest)).toBe(true);
    expect(Object.isFrozen(toolResultRequest.fields)).toBe(true);
    expect(Object.isFrozen(deliveryResultRequest)).toBe(true);
    expect(Object.isFrozen(deliveryResultRequest.fields)).toBe(true);
    expect(toolResultRequest.fields).toEqual([
      { name: 'agent_id', number: 1 },
      { name: 'idempotency_key', number: 2 },
      { name: 'installation_id', number: 3 },
      { name: 'invocation_id', number: 4 },
      { name: 'status', number: 5 },
      { name: 'output_ref', number: 6 },
      { name: 'provider_operation_id', number: 7 },
      { name: 'output_payload', number: 8 },
      { name: 'timestamp', number: 9 },
      { name: 'nonce', number: 10 },
      { name: 'raw_body_digest', number: 11 },
      { name: 'signature', number: 12 },
    ]);
    expect(deliveryResultRequest.fields).toEqual([
      { name: 'agent_id', number: 1 },
      { name: 'idempotency_key', number: 2 },
      { name: 'installation_id', number: 3 },
      { name: 'delivery_id', number: 4 },
      { name: 'status', number: 5 },
      { name: 'delivery_context_id', number: 6 },
      { name: 'provider_operation_id', number: 7 },
      { name: 'timestamp', number: 8 },
      { name: 'nonce', number: 9 },
      { name: 'raw_body_digest', number: 10 },
      { name: 'signature', number: 11 },
    ]);
    expect(
      collectProtoContractIssues(inputs.protoFiles, inputs.previousProtoFieldStabilitySnapshot)
    ).toEqual([]);
  });

  it('[WORKSPACE-GOVERNANCE-S009] pnpm check:codegen の main collector は PublishToolResultRequest の renumber を拒否する', () => {
    const issues = collectMainCollectorIssuesForProviderFieldMutation(
      collectAgentCodegenInputs(),
      'PublishToolResultRequest',
      'string status = 5;',
      'string status = 13;'
    );

    expect(issues).toEqual(
      expect.arrayContaining(['PublishToolResultRequest: field status moved from 5 to 13'])
    );
  });

  it('[WORKSPACE-GOVERNANCE-S009] pnpm check:codegen の main collector は PublishDeliveryResultRequest の field number reuse を拒否する', () => {
    const issues = collectMainCollectorIssuesForProviderFieldMutation(
      collectAgentCodegenInputs(),
      'PublishDeliveryResultRequest',
      'string status = 5;',
      'string replacement_status = 5;'
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        'PublishDeliveryResultRequest: field number 5 reused for replacement_status',
      ])
    );
  });
});
