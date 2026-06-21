import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const WORKSPACE_CONFIG_PATH = 'pnpm-workspace.yaml';
const MINIMUM_RELEASE_AGE_MINUTES = 72 * 60;

function getAllowBuildEntries(workspaceConfig) {
  const allowBuildsMatch = /^allowBuilds:\s*$\n(?<body>(?:[\t ]+.+\n?)*)/m.exec(workspaceConfig);
  if (!allowBuildsMatch?.groups?.body) return null;
  return allowBuildsMatch.groups.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

export function collectPnpmSupplyChainIssues(workspaceConfig, workspaceConfigPath = WORKSPACE_CONFIG_PATH) {
  const errors = [];

  const releaseAgeMatch = /^minimumReleaseAge:\s*(?<minutes>\d+)\s*$/m.exec(workspaceConfig);
  const minimumReleaseAgeMinutes = releaseAgeMatch?.groups?.minutes
    ? Number.parseInt(releaseAgeMatch.groups.minutes, 10)
    : null;

  if (minimumReleaseAgeMinutes === null) {
    errors.push(`Set minimumReleaseAge in ${workspaceConfigPath}.`);
  } else if (minimumReleaseAgeMinutes < MINIMUM_RELEASE_AGE_MINUTES) {
    errors.push(
      `minimumReleaseAge must be at least ${MINIMUM_RELEASE_AGE_MINUTES} minutes; current value is ${minimumReleaseAgeMinutes}.`
    );
  }

  const allowBuildEntries = getAllowBuildEntries(workspaceConfig);
  if (!allowBuildEntries) {
    errors.push(`Keep allowBuilds in ${workspaceConfigPath} so install scripts stay explicit.`);
  } else if (allowBuildEntries.length === 0) {
    errors.push(`Keep allowBuilds approvals package-by-package in ${workspaceConfigPath}.`);
  } else {
    for (const entry of allowBuildEntries) {
      if (!/^["']?(?!\*)[^"'*:]+["']?:\s*true\s*$/.test(entry)) {
        errors.push(`allowBuilds entry must approve one package with true: ${entry}`);
      }
    }
  }

  if (/^dangerouslyAllowAllBuilds:\s*true\s*$/m.test(workspaceConfig)) {
    errors.push('Do not enable dangerouslyAllowAllBuilds; approve install scripts package-by-package.');
  }

  if (/^minimumReleaseAgeExclude:/m.test(workspaceConfig)) {
    errors.push('Do not bypass the 72-hour release-age margin with minimumReleaseAgeExclude.');
  }

  return errors;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const workspaceConfig = readFileSync(WORKSPACE_CONFIG_PATH, 'utf8');
  const errors = collectPnpmSupplyChainIssues(workspaceConfig);

  if (errors.length > 0) {
    process.stderr.write(`Supply-chain guard failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}
