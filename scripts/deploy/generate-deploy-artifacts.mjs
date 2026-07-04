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
    ],
    forbiddenPaths: ['src/tests'],
    createPackageJson: createClientPackageJson,
    createTsconfig: createClientTsconfig,
    createReadme: createClientReadme,
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
 * @returns {{ name: string; branchName: string; path: string }[]} 生成した artifact の名前、branch、path。
 */
export function generateDeployArtifacts(options = {}) {
  const root = options.root ?? projectRoot;
  const outDir = options.outDir ?? resolve(root, '.deploy');

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
      copyProjectEntry(root, targetRoot, entry);
    }

    // package.json と tsconfig.json は monorepo path alias を self-contained root 用に書き換える。
    writeJson(
      resolve(targetRoot, 'package.json'),
      spec.createPackageJson(rootPackage, sourcePackage)
    );
    writeJson(resolve(targetRoot, 'tsconfig.json'), spec.createTsconfig());

    // Deploy Button 上でも運用者が境界と secret handling を読めるよう artifact 固有 README を生成する。
    writeText(resolve(targetRoot, 'README.md'), spec.createReadme());
    writeText(resolve(targetRoot, 'pnpm-workspace.yaml'), createArtifactPnpmWorkspace(root));
    writeText(resolve(targetRoot, '.gitignore'), createArtifactGitignore());

    // 必須 file と禁止 path を検査し、壊れた artifact branch を CI から publish しない。
    validateArtifact(targetRoot, spec);
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
3. Worker Secret \`AGENT_AUDIT_HASH_PEPPER\` を長いランダム値で設定します。
4. Management Client の Trust Config Export で生成した public-only JSON を \`AGENT_CONTROL_PLANE_TRUST\` に設定します。
5. \`AGENT_CONTROL_PLANE_TRUST\` には Ed25519 private key parameter \`d\`、private JWK、encrypted private JWK、生 JWT を含めません。
6. Deploy 後、Management Client から \`AgentHealthService.Check\` を実行して issuer/kid/fingerprint と trust config fingerprint を確認します。

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
3. \`AGENT_RPC_DEFAULT_ORIGIN\` を deployed Agent Worker origin に設定します。
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

function createArtifactPnpmWorkspace(root) {
  const workspaceConfig = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8');

  // Deploy artifact root は単一 package workspace として扱い、root repository の supply-chain policy は維持する。
  return workspaceConfig.replace(/^packages:\n(?:\s+- .+\n)+/m, "packages:\n  - '.'\n");
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

function copyProjectEntry(root, targetRoot, entry) {
  const sourcePath = resolve(root, entry.from);
  const targetPath = resolve(targetRoot, entry.to);
  const stats = statSync(sourcePath);

  // file と directory の両方を扱い、directory では tests など deploy 不要な subtree を除外する。
  if (stats.isDirectory()) {
    copyDirectory(root, sourcePath, targetPath, entry.excludes);
    return;
  }
  copyFile(targetPath, sourcePath);
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
    },
  });
  const outDir = resolve(projectRoot, values.out);
  const artifacts = generateDeployArtifacts({ root: projectRoot, outDir });

  // CI log には生成先と deploy branch 名だけを出し、secret value や config body は出力しない。
  for (const artifact of artifacts) {
    process.stdout.write(`Generated ${artifact.branchName} artifact at ${artifact.path}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
