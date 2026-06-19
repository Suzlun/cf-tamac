import { readFileSync } from 'node:fs';
import process from 'node:process';

const WORKSPACE_CONFIG_PATH = 'pnpm-workspace.yaml';
const MINIMUM_RELEASE_AGE_MINUTES = 72 * 60;

const workspaceConfig = readFileSync(WORKSPACE_CONFIG_PATH, 'utf8');
const errors = [];

const releaseAgeMatch = /^minimumReleaseAge:\s*(?<minutes>\d+)\s*$/m.exec(workspaceConfig);
const minimumReleaseAgeMinutes = releaseAgeMatch?.groups?.minutes
  ? Number.parseInt(releaseAgeMatch.groups.minutes, 10)
  : null;

if (minimumReleaseAgeMinutes === null) {
  errors.push(`Set minimumReleaseAge in ${WORKSPACE_CONFIG_PATH}.`);
} else if (minimumReleaseAgeMinutes < MINIMUM_RELEASE_AGE_MINUTES) {
  errors.push(
    `minimumReleaseAge must be at least ${MINIMUM_RELEASE_AGE_MINUTES} minutes; current value is ${minimumReleaseAgeMinutes}.`
  );
}

if (!/^allowBuilds:\s*$/m.test(workspaceConfig)) {
  errors.push(`Keep allowBuilds in ${WORKSPACE_CONFIG_PATH} so install scripts stay explicit.`);
}

if (/^dangerouslyAllowAllBuilds:\s*true\s*$/m.test(workspaceConfig)) {
  errors.push(
    'Do not enable dangerouslyAllowAllBuilds; approve install scripts package-by-package.'
  );
}

if (/^minimumReleaseAgeExclude:/m.test(workspaceConfig)) {
  errors.push('Do not bypass the 72-hour release-age margin with minimumReleaseAgeExclude.');
}

if (errors.length > 0) {
  process.stderr.write(
    `Supply-chain guard failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
  );
  process.exitCode = 1;
}
