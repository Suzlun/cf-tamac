import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  collectAgentCodegenIssues,
  collectGeneratedTreeDriftIssues,
  collectProtoFieldIssues,
  collectProtoFieldStabilityIssues,
  collectProtoServiceIssues,
  collectTypeSpecFieldIssues,
  rpcServiceInventory,
  snapshotGeneratedTree,
} from './check-agent-codegen-drift.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const protoRoot = fileURLToPath(new URL('../../packages/agent/proto/', import.meta.url));
const agentGeneratedRoot = fileURLToPath(new URL('../../packages/agent/src/generated/rpc/', import.meta.url));
const clientGeneratedRoot = fileURLToPath(new URL('../../packages/client/src/generated/agent-rpc/', import.meta.url));

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
    ]);
    expect(collectAgentCodegenIssues()).toEqual([]);

    runAgentGeneration();
    const secondHash = hashSnapshot([
      snapshotGeneratedTree(protoRoot, ['.proto']),
      snapshotGeneratedTree(agentGeneratedRoot, ['.ts']),
      snapshotGeneratedTree(clientGeneratedRoot, ['.ts']),
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
});
