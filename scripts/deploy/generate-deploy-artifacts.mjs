import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

const agentRuntimeExcludes = [
  /^packages\/agent\/src\/tests(?:\/|$)/,
  /^packages\/agent\/src\/typespec(?:\/|$)/,
];

const clientRuntimeExcludes = [/^packages\/client\/src\/tests(?:\/|$)/];

const sdkRuntimeExcludes = [/^packages\/sdk\/src\/tests(?:\/|$)/];

// Deploy Button 用の Client 設定例は、origin policy が受理する canonical HTTPS literal を固定する。
const clientAllowedOriginsExample =
  'AGENT_RPC_ALLOWED_ORIGINS=\'["https://cf-tamac-agent.example.workers.dev"]\'';
const clientAllowedOriginsWorkerVariable =
  'AGENT_RPC_ALLOWED_ORIGINS = \'["https://cf-tamac-agent.example.workers.dev"]\'';

const artifactSpecs = [
  {
    name: 'agent',
    branchName: 'deploy-agent',
    packagePath: 'packages/agent',
    copyEntries: [
      { from: 'packages/agent/src', to: 'src', excludes: agentRuntimeExcludes },
      { from: 'packages/agent/wrangler.toml', to: 'wrangler.toml' },
      { from: 'packages/agent/.dev.vars.example', to: '.dev.vars.example' },
    ],
    requiredFiles: [
      'package.json',
      'README.md',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'wrangler.toml',
      '.dev.vars.example',
      'src/index.ts',
      'src/AIAgent.ts',
      'src/generated/rpc/cftamac/agent/v1_pb.ts',
    ],
    forbiddenPaths: ['src/tests', 'src/typespec'],
    createPackageJson: createAgentPackageJson,
    createTsconfig: createAgentTsconfig,
    createReadme: createAgentReadme,
    workspacePackages: [],
  },
  {
    name: 'client',
    branchName: 'deploy-client',
    packagePath: 'packages/client',
    copyEntries: [
      { from: 'packages/client/app', to: 'app', excludes: [] },
      { from: 'packages/client/src', to: 'src', excludes: clientRuntimeExcludes },
      { from: 'packages/client/wrangler.toml', to: 'wrangler.toml' },
      { from: 'packages/client/next.config.ts', to: 'next.config.ts' },
      { from: 'packages/client/open-next.config.ts', to: 'open-next.config.ts' },
      { from: 'packages/client/postcss.config.mjs', to: 'postcss.config.mjs' },
      { from: 'packages/client/tailwind.config.ts', to: 'tailwind.config.ts' },
      { from: 'packages/client/components.json', to: 'components.json' },
      { from: 'packages/client/.dev.vars.example', to: '.dev.vars.example' },
      { from: 'packages/sdk/src', to: 'sdk/src', excludes: sdkRuntimeExcludes },
      { from: 'packages/sdk/package.json', to: 'sdk/package.json' },
    ],
    requiredFiles: [
      'package.json',
      'README.md',
      'pnpm-workspace.yaml',
      'tsconfig.json',
      'wrangler.toml',
      '.dev.vars.example',
      'app/page.tsx',
      'src/server/db/migrations/0001_client_foundation.sql',
      'src/server/db/migrations/0002_control_plane_signing_keys.sql',
      'src/generated/agent-rpc/cftamac/agent/v1_pb.ts',
      'sdk/package.json',
      'sdk/src/index.ts',
      'sdk/src/client.ts',
      'sdk/src/transport.ts',
      'sdk/src/provider-ingress.ts',
      'sdk/src/provider-ingress-transport.ts',
      'sdk/src/provider-ingress-types.ts',
      'sdk/src/generated/agent-rpc/cftamac/agent/v1_pb.ts',
    ],
    requiredContents: [
      { path: '.dev.vars.example', content: clientAllowedOriginsExample },
      { path: 'wrangler.toml', content: clientAllowedOriginsWorkerVariable },
    ],
    forbiddenPaths: ['src/tests'],
    createPackageJson: createClientPackageJson,
    createTsconfig: createClientTsconfig,
    createReadme: createClientReadme,
    workspacePackages: ['sdk'],
  },
];

/**
 * Deploy Button 用の self-contained Worker artifact を生成します。
 *
 * この関数は monorepo の Agent/Client 実装を source of truth とし、deploy branch root に置ける
 * 単一 Worker application tree を `.deploy/agent` と `.deploy/client` へ再構成します。生成先は毎回削除して
 * 作り直すため、deploy branch は手編集せず、repository source から決定的に再生成できます。
 *
 * @param {object} options 生成時の入力設定。
 * @param {string} options.root repository root。テストでは fixture ではなく実 repository を読む。
 * @param {string} options.outDir 生成先 directory。通常は `.deploy`、テストでは一時 directory。
 * @param {{ production: string; staging: string }} options.rateLimitNamespaceIds
 *   production/staging の Cloudflare Rate Limiting namespace ID。未指定時は対応する環境変数を使う。
 * @returns {{ name: string; branchName: string; path: string }[]} 生成した artifact の名前、branch、path。
 */
export function generateDeployArtifacts(options = {}) {
  const root = options.root ?? projectRoot;
  const outDir = options.outDir ?? resolve(root, '.deploy');
  const rateLimitNamespaceIds = resolveRateLimitNamespaceIds(options);

  // 生成 directory を先に消し、前回の不要 file が deploy branch に残らないようにする。
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // package version、license、packageManager は root package を正本として deploy artifact へ継承する。
  const rootPackage = readJson(resolve(root, 'package.json'));
  const artifacts = [];

  for (const spec of artifactSpecs) {
    const targetRoot = resolve(outDir, spec.name);
    const sourcePackage = readJson(resolve(root, spec.packagePath, 'package.json'));

    // artifact root を作り、各 Worker に必要な runtime source と設定だけをコピーする。
    mkdirSync(targetRoot, { recursive: true });
    for (const entry of spec.copyEntries) {
      copyProjectEntry(root, targetRoot, entry, rateLimitNamespaceIds);
    }

    // package.json と tsconfig.json は monorepo path alias を self-contained root 用に書き換える。
    writeJson(
      resolve(targetRoot, 'package.json'),
      spec.createPackageJson(rootPackage, sourcePackage)
    );
    writeJson(resolve(targetRoot, 'tsconfig.json'), spec.createTsconfig());

    // Deploy Button 上でも運用者が境界と secret handling を読めるよう artifact 固有 README を生成する。
    writeText(resolve(targetRoot, 'README.md'), spec.createReadme());
    writeText(
      resolve(targetRoot, 'pnpm-workspace.yaml'),
      createArtifactPnpmWorkspace(root, spec.workspacePackages)
    );
    writeText(resolve(targetRoot, '.gitignore'), createArtifactGitignore());

    // 必須 file と禁止 path を検査し、壊れた artifact branch を CI から publish しない。
    validateArtifact(targetRoot, spec);
    if (spec.name === 'agent') {
      validateAgentRateLimitNamespaces(targetRoot, rateLimitNamespaceIds);
    }
    artifacts.push({ name: spec.name, branchName: spec.branchName, path: targetRoot });
  }

  return artifacts;
}

function createAgentPackageJson(rootPackage, sourcePackage) {
  return {
    name: '@cf-tamac/deploy-agent',
    version: rootPackage.version,
    private: true,
    license: rootPackage.license,
    type: 'module',
    packageManager: rootPackage.packageManager,
    scripts: {
      dev: 'wrangler dev --config wrangler.toml',
      build: 'tsc -p tsconfig.json --noEmit',
      deploy: 'wrangler deploy --config wrangler.toml',
    },
    dependencies: sourcePackage.dependencies,
    devDependencies: selectVersions(rootPackage, sourcePackage, [
      '@cloudflare/workers-types',
      '@types/node',
      'typescript',
      'wrangler',
    ]),
  };
}

function createClientPackageJson(rootPackage, sourcePackage) {
  return {
    name: '@cf-tamac/deploy-client',
    version: rootPackage.version,
    private: true,
    license: rootPackage.license,
    type: 'module',
    packageManager: rootPackage.packageManager,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      'build:worker': 'opennextjs-cloudflare build',
      deploy: 'pnpm build:worker && wrangler deploy --config wrangler.toml',
      'deploy:with-migrations':
        'wrangler d1 migrations apply cf-tamac-client-db --remote --config wrangler.toml && pnpm deploy',
      'db:migrate:remote':
        'wrangler d1 migrations apply cf-tamac-client-db --remote --config wrangler.toml',
    },
    dependencies: sourcePackage.dependencies,
    devDependencies: sourcePackage.devDependencies,
  };
}

function createAgentTsconfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      rootDir: '.',
      outDir: 'dist',
      baseUrl: '.',
      paths: {
        '@cf-tamac/agent-rpc/*': ['src/generated/rpc/*'],
      },
      resolveJsonModule: true,
      allowJs: true,
      checkJs: false,
      strict: true,
      noUncheckedIndexedAccess: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      noImplicitReturns: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      types: ['@cloudflare/workers-types', 'node'],
    },
    include: ['src/**/*.ts'],
    exclude: ['src/generated/**', 'node_modules', 'dist', '.wrangler'],
  };
}

function createClientTsconfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      rootDir: '.',
      outDir: 'dist',
      jsx: 'react-jsx',
      noEmit: true,
      incremental: true,
      baseUrl: '.',
      paths: {
        '@cf-tamac/client/*': ['src/*'],
        '@cf-tamac/client-agent-rpc/*': ['src/generated/agent-rpc/*'],
      },
      resolveJsonModule: true,
      allowJs: true,
      checkJs: false,
      strict: true,
      noUncheckedIndexedAccess: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      noImplicitReturns: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      types: ['@cloudflare/workers-types', 'node'],
      plugins: [{ name: 'next' }],
    },
    include: [
      'app/**/*.ts',
      'app/**/*.tsx',
      'src/**/*.ts',
      'src/**/*.tsx',
      'next.config.ts',
      'open-next.config.ts',
      'tailwind.config.ts',
      'postcss.config.mjs',
      '.next/types/**/*.ts',
      '.next/dev/types/**/*.ts',
    ],
    exclude: ['src/generated/**', '.next', '.open-next', 'dist', 'node_modules'],
  };
}

function createAgentReadme() {
  return `# cf-tamac Agent Service deploy artifact

この branch root は Cloudflare Deploy Button 用の self-contained Agent Worker application です。monorepo source から自動生成され、手編集しません。

## Deploy

1. Cloudflare Deploy Button でこの branch を選択します。
2. \`AGENT_RPC_AUDIENCE\` が \`AGENT_CONTROL_PLANE_TRUST.audiences\` と一致することを確認します。
3. Worker configuration に production/staging の専用 Rate Limiting namespace ID が注入済みであることを確認します。artifactへ source repository のfixture値はコピーされません。
4. Worker Secret \`AGENT_AUDIT_HASH_PEPPER\` を長いランダム値で設定します。
5. Management Client の Trust Config Export で生成した public-only JSON を \`AGENT_CONTROL_PLANE_TRUST\` に設定します。
6. \`AGENT_CONTROL_PLANE_TRUST\` には Ed25519 private key parameter \`d\`、private JWK、encrypted private JWK、生 JWT を含めません。
7. Deploy 後、Management Client から \`AgentHealthService.Check\` を実行して issuer/kid/fingerprint と trust config fingerprint を確認します。

## Local commands

\`\`\`bash
pnpm install
pnpm build
pnpm deploy
\`\`\`

Agent public API は Connect unary binary Protobuf だけです。REST、OpenAPI、Orval、JSON DTO、public Durable Object fetch API は公開しません。
`;
}

function createClientReadme() {
  return `# cf-tamac Management Client deploy artifact

この branch root は Cloudflare Deploy Button 用の self-contained Management Client Worker application です。monorepo source から自動生成され、手編集しません。

## Deploy

1. Agent Service を先に deploy し、Agent Worker origin を控えます。
2. Cloudflare Deploy Button でこの branch を選択します。
3. \`AGENT_RPC_ALLOWED_ORIGINS='["https://cf-tamac-agent.example.workers.dev"]'\` の example を、deployed Agent Worker の canonical HTTPS origin だけを含む non-empty JSON array に置き換えます。
4. D1 binding \`CLIENT_DB\` を作成または選択し、\`src/server/db/migrations\` の migrations を適用します。
5. Worker Secret \`CLIENT_CREDENTIAL_ENCRYPTION_KEY\` を base64 encoded 32-byte AES key で設定します。
6. \`CLIENT_CONTROL_PLANE_PRIVATE_KEYS\` は使いません。Ed25519 private JWK は Management Client UI が生成し、\`CLIENT_CREDENTIAL_ENCRYPTION_KEY\` で暗号化して Client D1 に保存します。
7. Cloudflare Access を Management Client の前段に置き、Browser-visible code に Agent credential、JWT signing material、Provider secret が出ないことを確認します。

## Local commands

\`\`\`bash
pnpm install
pnpm build
pnpm deploy:with-migrations
\`\`\`

Client は Agent RPC を server-only module からのみ呼びます。\`/api/client/*\`、\`/api/agent*\`、Agent API proxy route、browser direct Agent RPC は公開しません。
`;
}

function createArtifactGitignore() {
  return `node_modules/
dist/
.next/
.open-next/
.wrangler/
.dev.vars
next-env.d.ts
*.tsbuildinfo
`;
}

function createArtifactPnpmWorkspace(root, workspacePackages) {
  const workspaceConfig = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
  const artifactPackages = ['.', ...workspacePackages]
    .map((packagePath) => `  - '${packagePath}'`)
    .join('\n');

  // Client artifact では SDK package も同じ workspace に含め、workspace:* dependency を self-contained root で解決する。
  // root repository の supply-chain policy は加工せず、artifact にそのまま継承する。
  return workspaceConfig.replace(/^packages:\n(?:\s+- .+\n)+/m, `packages:\n${artifactPackages}\n`);
}

function selectVersions(rootPackage, sourcePackage, packageNames) {
  const versions = {};
  for (const packageName of packageNames) {
    const version =
      sourcePackage.dependencies?.[packageName] ??
      sourcePackage.devDependencies?.[packageName] ??
      rootPackage.dependencies?.[packageName] ??
      rootPackage.devDependencies?.[packageName];
    if (version === undefined) {
      throw new Error(`Missing dependency version for ${packageName}`);
    }
    versions[packageName] = version;
  }
  return versions;
}

function copyProjectEntry(root, targetRoot, entry, rateLimitNamespaceIds) {
  const sourcePath = resolve(root, entry.from);
  const targetPath = resolve(targetRoot, entry.to);
  const stats = statSync(sourcePath);

  // file と directory の両方を扱い、directory では tests など deploy 不要な subtree を除外する。
  if (stats.isDirectory()) {
    copyDirectory(root, sourcePath, targetPath, entry.excludes);
    return;
  }
  if (entry.from === 'packages/agent/wrangler.toml') {
    // Agent Wrangler は source の例値をそのまま publish せず、release operator の明示入力で置換する。
    writeText(
      targetPath,
      renderAgentWrangler(readFileSync(sourcePath, 'utf8'), rateLimitNamespaceIds)
    );
    return;
  }
  copyFile(targetPath, sourcePath);
}

function resolveRateLimitNamespaceIds(options) {
  const production =
    options.rateLimitNamespaceIds?.production ??
    options.productionRateLimitNamespaceId ??
    process.env.CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_PRODUCTION;
  const staging =
    options.rateLimitNamespaceIds?.staging ??
    options.stagingRateLimitNamespaceId ??
    process.env.CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_STAGING;

  assertRateLimitNamespaceId(production, 'production');
  assertRateLimitNamespaceId(staging, 'staging');
  if (production === staging) {
    throw new Error(
      'CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_PRODUCTION and CF_TAMAC_AGENT_RATE_LIMIT_NAMESPACE_STAGING must differ'
    );
  }
  return { production, staging };
}

function assertRateLimitNamespaceId(value, environment) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
    throw new Error(
      `A positive integer Rate Limiting namespace ID is required for ${environment}; pass the explicit generator input or environment variable`
    );
  }
}

function renderAgentWrangler(source, rateLimitNamespaceIds) {
  const production = replaceNamespaceId(source, '[[ratelimits]]', rateLimitNamespaceIds.production);
  return replaceNamespaceId(
    production,
    '[[env.staging.ratelimits]]',
    rateLimitNamespaceIds.staging
  );
}

function replaceNamespaceId(source, section, namespaceId) {
  const sectionStart = source.indexOf(section);
  const sectionBody = sectionStart === -1 ? '' : source.slice(sectionStart);
  const namespaceMatch = /(namespace_id\s*=\s*")([1-9]\d*)(")/u.exec(sectionBody);
  if (namespaceMatch?.index === undefined) {
    throw new Error(`Agent Wrangler is missing ${section} namespace_id`);
  }
  const replacement = namespaceMatch[0].replace(namespaceMatch[2], namespaceId);
  const absoluteStart = sectionStart + namespaceMatch.index;
  return `${source.slice(0, absoluteStart)}${replacement}${source.slice(
    absoluteStart + namespaceMatch[0].length
  )}`;
}

function validateAgentRateLimitNamespaces(agentRoot, rateLimitNamespaceIds) {
  const wrangler = readFileSync(resolve(agentRoot, 'wrangler.toml'), 'utf8');
  const production = extractNamespaceId(wrangler, '[[' + 'ratelimits' + ']]');
  const staging = extractNamespaceId(wrangler, '[[' + 'env.staging.ratelimits' + ']]');
  if (
    production !== rateLimitNamespaceIds.production ||
    staging !== rateLimitNamespaceIds.staging
  ) {
    throw new Error(
      'Generated Agent artifact does not contain the requested Rate Limiting namespace IDs'
    );
  }
  if (production === staging) {
    throw new Error(
      'Generated Agent artifact must keep production and staging Rate Limiting namespaces distinct'
    );
  }
}

function extractNamespaceId(wrangler, section) {
  const sectionStart = wrangler.indexOf(section);
  const sectionBody = sectionStart === -1 ? '' : wrangler.slice(sectionStart);
  const match = /namespace_id\s*=\s*"([1-9]\d*)"/u.exec(sectionBody);
  if (match?.[1] === undefined)
    throw new Error(`Generated Agent artifact is missing ${section} namespace_id`);
  return match[1];
}

function copyDirectory(projectRootPath, sourceDirectory, targetDirectory, excludes) {
  mkdirSync(targetDirectory, { recursive: true });
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = resolve(sourceDirectory, entry.name);
    const projectRelativePath = toPosixPath(relative(projectRootPath, sourcePath));

    // deploy branch は runtime application root なので tests と TypeSpec source を含めない。
    if (excludes.some((exclude) => exclude.test(projectRelativePath))) {
      continue;
    }

    const targetPath = resolve(targetDirectory, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(projectRootPath, sourcePath, targetPath, excludes);
    } else if (entry.isFile()) {
      copyFile(targetPath, sourcePath);
    }
  }
}

function copyFile(targetPath, sourcePath) {
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
}

function validateArtifact(targetRoot, spec) {
  for (const requiredFile of spec.requiredFiles) {
    const filePath = resolve(targetRoot, requiredFile);
    if (!existsSync(filePath)) {
      throw new Error(`${spec.name} deploy artifact is missing ${requiredFile}`);
    }
  }
  for (const forbiddenPath of spec.forbiddenPaths) {
    const filePath = resolve(targetRoot, forbiddenPath);
    if (existsSync(filePath)) {
      throw new Error(`${spec.name} deploy artifact must not include ${forbiddenPath}`);
    }
  }
  for (const requiredContent of spec.requiredContents ?? []) {
    const filePath = resolve(targetRoot, requiredContent.path);

    // copied configuration が canonical example を失うと、deploy root から安全な origin policy を設定できない。
    if (!readFileSync(filePath, 'utf8').includes(requiredContent.content)) {
      throw new Error(
        `${spec.name} deploy artifact is missing canonical configuration in ${requiredContent.path}`
      );
    }
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function toPosixPath(path) {
  return path.replaceAll('\\\\', '/');
}

function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: '.deploy' },
      'production-rate-limit-namespace-id': { type: 'string' },
      'staging-rate-limit-namespace-id': { type: 'string' },
    },
  });
  const outDir = resolve(projectRoot, values.out);
  const artifacts = generateDeployArtifacts({
    root: projectRoot,
    outDir,
    productionRateLimitNamespaceId: values['production-rate-limit-namespace-id'],
    stagingRateLimitNamespaceId: values['staging-rate-limit-namespace-id'],
  });

  // CI log には生成先と deploy branch 名だけを出し、secret value や config body は出力しない。
  for (const artifact of artifacts) {
    process.stdout.write(`Generated ${artifact.branchName} artifact at ${artifact.path}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
