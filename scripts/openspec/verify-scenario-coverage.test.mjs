import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectTestScenarioReferences,
  computeCoverage,
  getDuplicateScenarioErrors,
  indexScenariosById,
  loadScenarios,
} from './verify-scenario-coverage.mjs';

function writeFixture(root, relativePath, content) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

function scenarioReference(id) {
  return `[${id}]`;
}

describe('OpenSpec Scenario ID coverage governance', () => {
  it('[WORKSPACE-GOVERNANCE-S005] Scenario ID coverage validates foundation specs', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'openspec-coverage-fixtures-'));
    const validId = 'FOUNDATION-COVERAGE-S001';
    const missingId = 'FOUNDATION-COVERAGE-S002';
    const duplicateId = 'FOUNDATION-COVERAGE-S003';
    const orphanId = 'FOUNDATION-COVERAGE-S999';

    try {
      const validSpec = writeFixture(
        fixtureRoot,
        'specs/valid/spec.md',
        `# Valid

## Requirements

### Requirement: Valid coverage

#### Scenario: Valid covered behavior (${validId})
- **WHEN** tests reference the scenario
- **THEN** coverage passes for that scenario
`
      );
      const missingSpec = writeFixture(
        fixtureRoot,
        'specs/missing/spec.md',
        `# Missing

## Requirements

### Requirement: Missing coverage

#### Scenario: Missing test reference (${missingId})
- **WHEN** no automated test references the scenario
- **THEN** coverage reports it as missing
`
      );
      const duplicateSpecA = writeFixture(
        fixtureRoot,
        'specs/duplicate-a/spec.md',
        `# Duplicate A

## Requirements

### Requirement: Duplicate coverage

#### Scenario: Duplicate scenario A (${duplicateId})
- **WHEN** two specs reuse an ID
- **THEN** coverage reports a duplicate
`
      );
      const duplicateSpecB = writeFixture(
        fixtureRoot,
        'specs/duplicate-b/spec.md',
        `# Duplicate B

## Requirements

### Requirement: Duplicate coverage

#### Scenario: Duplicate scenario B (${duplicateId})
- **WHEN** two specs reuse an ID
- **THEN** coverage reports a duplicate
`
      );
      const testFile = writeFixture(
        fixtureRoot,
        'tests/coverage.test.mjs',
        `it('${scenarioReference(validId)} covers valid behavior', () => {});
it('${scenarioReference(duplicateId)} covers duplicate behavior once', () => {});
it('${scenarioReference(orphanId)} references an unknown behavior', () => {});
`
      );

      const { scenarios, parseErrors } = loadScenarios([validSpec, missingSpec, duplicateSpecA, duplicateSpecB]);
      const byId = indexScenariosById(scenarios);
      const duplicateErrors = getDuplicateScenarioErrors(byId);
      const referencedIn = collectTestScenarioReferences([testFile]);
      const { missing, orphans } = computeCoverage(byId, scenarios, referencedIn);

      expect(parseErrors).toEqual([]);
      expect(duplicateErrors).toEqual([expect.stringContaining(duplicateId)]);
      expect(missing).toEqual([missingId]);
      expect(orphans).toEqual([orphanId]);
      expect(missing).not.toContain(validId);
      expect(orphans).not.toContain(validId);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
