import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const workflowFiles = [
  '.opencode/skills/coding-guardian/SKILL.md',
  '.opencode/skills/coding-guardian/references/repo-entrypoints.md',
  '.opencode/agents/openspec/applier.md',
  '.opencode/agents/unit/agent/engineer.md',
  '.opencode/agents/unit/agent/reviewer.md',
  '.opencode/agents/unit/client/engineer.md',
  '.opencode/agents/unit/client/reviewer.md',
  '.opencode/agents/unit/build/builder.md',
  '.opencode/agents/unit/build/reviewer.md',
];

const generatedPolicyPaths = [
  'packages/agent/proto/**',
  'packages/agent/src/generated/rpc/**',
  'packages/client/src/generated/agent-rpc/**',
  'packages/sdk/src/generated/agent-rpc/**',
];

const sdkPackagePath = 'packages/sdk/package.json';
const sdkGeneratedDescriptorRoot = 'packages/sdk/src/generated/agent-rpc';
const sdkGeneratedDescriptorEntry = `${sdkGeneratedDescriptorRoot}/cftamac/agent/v1_pb.ts`;
const sdkDescriptorExportPath = './agent-rpc/*';
const sdkDescriptorExportTarget = './src/generated/agent-rpc/*';
const sdkBufGenerationTarget = '../sdk/src/generated/agent-rpc';
const providerIngressRateLimitBindingName = 'PROVIDER_INGRESS_RATE_LIMITER';
const providerIngressRateLimitProfiles = [
  { label: 'production', section: '[[ratelimits]]' },
  { label: 'staging', section: '[[env.staging.ratelimits]]' },
];
const clientRegistrationMetadata = [
  ['registrationState', 'registration_state'],
  ['registrationAttemptId', 'registration_attempt_id'],
  ['initializationIdempotencyKey', 'initialization_idempotency_key'],
  ['registrationRequestDigest', 'registration_request_digest'],
];
const providerSdkSourcePaths = [
  'packages/sdk/src/provider-ingress.ts',
  'packages/sdk/src/provider-ingress-transport.ts',
  'packages/sdk/src/provider-ingress-types.ts',
];
const clientServiceSdkSourcePaths = [
  'packages/sdk/src/client.ts',
  'packages/sdk/src/transport.ts',
  'packages/sdk/src/auth/client-service-jwt.ts',
];

// 既存 domain の storage 依存は Phase 0 の開始時点でこの 5 ファイルに閉じているため、
// 新規 domain ファイルへ同じ例外が広がらないよう normalized path で固定する。
const agentDomainStorageImportExceptionPaths = new Set([
  '/packages/agent/src/domain/agent-operation-utils.ts',
  '/packages/agent/src/domain/lifecycle-audit.ts',
  '/packages/agent/src/domain/lifecycle-operations.ts',
  '/packages/agent/src/domain/model-policy-operations.ts',
  '/packages/agent/src/domain/state-operations.ts',
]);

/**
 * Collect Agent/Client runtime coupling, binding, and workflow boundary issues.
 */
export function collectPackageBoundaryIssues(root = projectRoot) {
  return [
    ...collectRuntimeCouplingIssues(root),
    ...collectSdkPackageBoundaryIssues(root),
    ...collectAgentLayerIssues(root),
    ...collectClientBoundaryIssues(root),
    ...collectClientD1StoragePolicyIssues(root),
    ...collectClientRegistrationMetadataOwnershipIssues(root),
    ...collectBindingIssues(root),
    ...collectAgentProviderIngressRateLimitIssues(root),
    ...collectSdkAuthenticationAggregateBoundaryIssues(root),
    ...collectOpenCodeWorkflowIssues(root),
  ];
}

export function collectRuntimeCouplingIssues(root) {
  const issues = [];
  for (const filePath of collectFiles(`${root}/packages/agent/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    if (
      /from ["'](?:@cf-tamac\/client(?:["'/]|-agent-rpc)|@cf-tamac\/client-agent-rpc)|packages\/client\/src|\.\.\/client\//.test(
        content
      )
    ) {
      issues.push(`${normalizedPath}: Agent runtime must not import Client runtime`);
    }
  }
  for (const filePath of collectFiles(`${root}/packages/client/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    if (/from ["']@cf-tamac\/agent["'/]|packages\/agent\/src|\.\.\/agent\//.test(content)) {
      issues.push(`${normalizedPath}: Client runtime must not import Agent runtime`);
    }
  }
  // SDK runtime は Agent/Client runtime の代替実装ではなく、SDK 自身の generated descriptor を使う consumer に固定します。
  for (const filePath of collectFiles(`${root}/packages/sdk/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const imports = collectResolvedImports(root, filePath);
    if (imports.some((importedPath) => isForbiddenSdkRuntimeImport(importedPath))) {
      issues.push(
        `${normalizedPath}: SDK runtime must not import Agent or Client runtime or generated RPC from another package`
      );
    }
  }
  return issues;
}

/**
 * Collect SDK package metadata and generated-descriptor ownership issues.
 */
export function collectSdkPackageBoundaryIssues(root) {
  const issues = [];
  const packageManifestPath = `${root}/${sdkPackagePath}`;

  // package metadata が存在しない状態は SDK を workspace の server-side package として分類できないため fail closed にします。
  if (!existsSync(packageManifestPath)) {
    return [`${sdkPackagePath}: missing SDK package metadata`];
  }
  const packageManifest = readJsonRecord(packageManifestPath);
  if (packageManifest === undefined) {
    return [`${sdkPackagePath}: SDK package metadata must be valid JSON object`];
  }
  // 固定 package name により、Client の server-side dependency と SDK ownership の識別子を一意に保ちます。
  if (packageManifest.name !== '@cf-tamac/sdk') {
    issues.push(`${sdkPackagePath}: SDK package name must be @cf-tamac/sdk`);
  }
  // browser false は bundler と静的検査が SDK を browser-delivered graph から除外するための明示的な contract です。
  if (packageManifest.browser !== false) {
    issues.push(`${sdkPackagePath}: SDK package must set browser to false`);
  }
  // public entrypoint と generated descriptor export を SDK package 内へ固定し、別 package の descriptor ownership を混在させません。
  if (!hasSdkDescriptorExports(packageManifest)) {
    issues.push(
      `${sdkPackagePath}: SDK package must export its generated Agent RPC descriptors from ${sdkDescriptorExportTarget}`
    );
  }

  const generatedDescriptorRootPath = `${root}/${sdkGeneratedDescriptorRoot}`;
  // root 自体がない場合は mandatory generated-policy target が欠けているため、descriptor entry の検査へ進まず fail closed にします。
  if (!existsSync(generatedDescriptorRootPath)) {
    issues.push(
      `${sdkGeneratedDescriptorRoot}: SDK generated Agent RPC descriptor output root is missing`
    );
  } else if (!existsSync(`${root}/${sdkGeneratedDescriptorEntry}`)) {
    // root 内の canonical descriptor を固定し、空 directory や手書きの代替 entrypoint を generated output と認識しません。
    issues.push(
      `${sdkGeneratedDescriptorEntry}: SDK generated Agent RPC canonical descriptor entry is missing`
    );
  }
  const bufGenerationConfigPath = `${root}/packages/agent/buf.gen.yaml`;
  // Buf target は Agent proto から SDK descriptor を生成する唯一の ownership seam なので、生成先登録の欠落を拒否します。
  if (
    !existsSync(bufGenerationConfigPath) ||
    !hasSdkBufGenerationTarget(readFileSync(bufGenerationConfigPath, 'utf8'))
  ) {
    issues.push(
      'packages/agent/buf.gen.yaml: SDK generated Agent RPC descriptor output must be owned by pnpm gen:agent:rpc'
    );
  }

  // SDK source 自身が browser client directive を宣言すると package metadata と実行境界が矛盾するため拒否します。
  for (const filePath of collectFiles(`${root}/packages/sdk/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (
      !/\.(?:ts|tsx)$/.test(normalizedPath) ||
      normalizedPath.includes('/src/generated/') ||
      normalizedPath.includes('/src/tests/')
    ) {
      continue;
    }
    if (/^["']use client["'];?/.test(readFileSync(filePath, 'utf8').trimStart())) {
      issues.push(`${normalizedPath}: SDK runtime must not declare a browser client entrypoint`);
    }
  }
  return [...new Set(issues)];
}

/**
 * Collect Agent layer direction issues that would reintroduce inverted runtime dependencies.
 */
export function collectAgentLayerIssues(root) {
  const issues = [];
  for (const filePath of collectFiles(`${root}/packages/agent/src`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const imports = collectResolvedImports(root, filePath);
    const content = readFileSync(filePath, 'utf8');

    issues.push(...collectAgentFoundationLayerImportIssues(normalizedPath, imports, content));
    issues.push(...collectAgentDurableObjectLayerIssues(normalizedPath, imports));
    issues.push(...collectAgentApplicationLayerIssues(normalizedPath, imports));
    issues.push(...collectAgentDomainLayerIssues(normalizedPath, imports));
    issues.push(...collectAgentStorageLayerIssues(normalizedPath, imports));
    issues.push(...collectAgentRpcServiceLayerIssues(normalizedPath, imports, content));
    issues.push(...collectAgentRpcDispatchLayerIssues(normalizedPath, imports));
    issues.push(...collectAgentRpcMapperLayerIssues(normalizedPath, imports));
  }
  return [...new Set(issues)];
}

function collectAgentFoundationLayerImportIssues(normalizedPath, imports, content) {
  if (!isAgentRuntimeFoundationPath(normalizedPath)) {
    return [];
  }
  const issues = [];
  for (const importedPath of imports) {
    if (
      isAgentRpcPath(importedPath) ||
      isAgentWorkerEntrypointPath(importedPath) ||
      isAgentGeneratedRpcPath(importedPath)
    ) {
      issues.push(
        `${normalizedPath}: Agent runtime/domain/storage layer must not import RPC, Worker, or generated descriptor layers`
      );
    }
    if (isForbiddenAgentLowerLayerExternal(normalizedPath, importedPath)) {
      issues.push(
        `${normalizedPath}: Agent runtime/domain/storage layer must not import framework, transport, persistence, or platform runtime packages`
      );
    }
  }
  if (/\b(?:fetch|Headers|Request|Response)\b/.test(content)) {
    issues.push(
      `${normalizedPath}: Agent runtime/domain/storage layer must not use Worker network globals directly`
    );
  }
  return issues;
}

function collectAgentDurableObjectLayerIssues(normalizedPath, imports) {
  if (!isAgentDurableObjectLayerPath(normalizedPath)) {
    return [];
  }
  const issues = [];
  for (const importedPath of imports) {
    if (
      isAgentRpcServicePath(importedPath) ||
      isAgentRpcRouterPath(importedPath) ||
      isAgentRpcInterceptorPath(importedPath) ||
      isAgentWorkerEntrypointPath(importedPath) ||
      isAgentGeneratedRpcPath(importedPath)
    ) {
      issues.push(
        `${normalizedPath}: Agent durable-object layer must not import RPC services, router, interceptors, Worker entrypoints, or generated descriptor layers`
      );
    }
  }
  return issues;
}

function collectAgentApplicationLayerIssues(normalizedPath, imports) {
  if (!isAgentApplicationPath(normalizedPath)) {
    return [];
  }
  const issues = [];
  for (const importedPath of imports) {
    if (isAgentRoutingPath(importedPath) || isAgentDurableObjectPath(importedPath)) {
      issues.push(
        `${normalizedPath}: Agent application layer must not import routing or Durable Object layers`
      );
    }
  }
  return issues;
}

function collectAgentDomainLayerIssues(normalizedPath, imports) {
  if (!isAgentDomainPath(normalizedPath)) {
    return [];
  }
  const issues = [];
  const allowsExistingStorageImport = agentDomainStorageImportExceptionPaths.has(normalizedPath);
  for (const importedPath of imports) {
    if (
      isAgentApplicationPath(importedPath) ||
      isAgentDurableObjectPath(importedPath) ||
      isAgentRoutingPath(importedPath) ||
      (isAgentStoragePath(importedPath) && !allowsExistingStorageImport)
    ) {
      issues.push(
        `${normalizedPath}: Agent domain layer must not import application, Durable Object, routing, or storage layers`
      );
    }
  }
  return issues;
}

function collectAgentStorageLayerIssues(normalizedPath, imports) {
  if (!isAgentStoragePath(normalizedPath)) {
    return [];
  }
  const issues = [];
  for (const importedPath of imports) {
    if (
      isAgentDomainRuntimePath(importedPath) ||
      isAgentApplicationPath(importedPath) ||
      isAgentDurableObjectPath(importedPath) ||
      isAgentRoutingPath(importedPath)
    ) {
      issues.push(
        `${normalizedPath}: Agent storage layer must not import Agent domain, application, Durable Object, runtime, or routing layers`
      );
    }
    if (
      isAgentRpcPath(importedPath) ||
      isAgentWorkerEntrypointPath(importedPath) ||
      isAgentGeneratedRpcPath(importedPath)
    ) {
      issues.push(
        `${normalizedPath}: Agent storage must not import Worker, RPC facade, or generated descriptor layers`
      );
    }
  }
  return issues;
}

function collectAgentRpcServiceLayerIssues(normalizedPath, imports, content) {
  if (!normalizedPath.startsWith('/packages/agent/src/rpc/services/')) {
    return [];
  }
  const issues = imports
    .filter(
      (importedPath) =>
        isAgentRpcFacadePath(importedPath) ||
        importedPath.startsWith('/packages/agent/src/rpc/interceptors/')
    )
    .map(
      () =>
        `${normalizedPath}: Agent RPC service modules must not import router, adapter, or interceptor layers`
    );
  if (/\b(?:fetch|Headers|Request|Response)\b/.test(content)) {
    issues.push(
      `${normalizedPath}: Agent RPC service modules must not use Worker network globals directly`
    );
  }
  return issues;
}

function collectAgentRpcDispatchLayerIssues(normalizedPath, imports) {
  if (!isAgentRpcDispatchPath(normalizedPath)) {
    return [];
  }
  return imports
    .filter((importedPath) => isAgentWorkerEntrypointPath(importedPath))
    .map(() => `${normalizedPath}: Agent RPC dispatch modules must not import Worker entrypoints`);
}

function collectAgentRpcMapperLayerIssues(normalizedPath, imports) {
  if (!isAgentRpcMapperPath(normalizedPath)) {
    return [];
  }
  const issues = [];
  for (const importedPath of imports) {
    if (
      isAgentDurableObjectPath(importedPath) ||
      isAgentRoutingPath(importedPath) ||
      isAgentWorkerEntrypointPath(importedPath)
    ) {
      issues.push(
        `${normalizedPath}: Agent RPC mapper modules must not import Durable Object, routing, or Worker entrypoint layers`
      );
    }
  }
  return issues;
}

/**
 * Collect Next.js Client server/browser boundary issues.
 */
export function collectClientBoundaryIssues(root) {
  const issues = [];
  for (const filePath of collectFiles(`${root}/packages/client`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (!/\.(?:ts|tsx)$/.test(normalizedPath)) {
      continue;
    }
    if (normalizedPath.includes('/src/generated/') || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    const imports = collectResolvedImports(root, filePath);

    if (isClientBrowserVisiblePath(normalizedPath, content)) {
      for (const importedPath of imports) {
        if (isForbiddenClientBrowserImport(importedPath)) {
          issues.push(
            `${normalizedPath}: Client browser-visible modules must not import server-only Agent RPC, credentials, or Connect runtime`
          );
        }
      }
      if (
        /createServerAgentRpcClients|CLIENT_DB|credentialRef|credential_ref|@cf-tamac\/sdk(?:-agent-rpc)?["'/]/.test(
          content
        ) ||
        /authorization|bearer/i.test(content)
      ) {
        issues.push(
          `${normalizedPath}: Client browser-visible modules must not contain Agent RPC credential or Client D1 access seams`
        );
      }
      if (
        /privatejwk|private_jwk|encryptedprivatejwk|encrypted_private_jwk|rawjwt|raw_jwt|signingmaterial|signing material|createcompactjwt|crypto\.subtle\.sign/i.test(
          content
        )
      ) {
        issues.push(
          `${normalizedPath}: Client browser-visible modules must not contain signing material, private JWK, encrypted private JWK, raw JWT, or signing logic`
        );
      }
      if (
        /\bfetch\s*\(|\bglobalThis\.fetch\s*\(/.test(content) ||
        imports.includes('axios') ||
        imports.includes('cross-fetch')
      ) {
        issues.push(
          `${normalizedPath}: Client browser-visible modules must not perform direct network calls`
        );
      }
    }

    if (
      normalizedPath.startsWith('/packages/client/src/server/agent-rpc/') &&
      !content.includes("import 'server-only';")
    ) {
      issues.push(`${normalizedPath}: Client Agent RPC modules must import server-only`);
    }
    if (
      normalizedPath.startsWith('/packages/client/src/server/agent-rpc/') &&
      /\bHS256\b|resolveCredentialSecret|AGENT_CREDENTIAL_|credentialRef|credential_ref|secretMaterial|sharedSecret|shared_secret/.test(
        content
      )
    ) {
      issues.push(
        `${normalizedPath}: Client Agent RPC signing must use the encrypted Ed25519 signing key store, not HS256, resolveCredentialSecret, AGENT_CREDENTIAL_ Worker Secrets, credentialRef, or shared secrets`
      );
    }
  }
  return [...new Set(issues)];
}

/**
 * Client D1 の永続化対象が encrypted signing key store を許可しつつ、Agent domain snapshot と平文 secret を拒否することを検査します。
 */
export function collectClientD1StoragePolicyIssues(root) {
  const issues = [];
  for (const filePath of collectFiles(`${root}/packages/client/src/server/db`)) {
    const normalizedPath = normalizePath(root, filePath);
    if (!/\.(?:ts|sql)$/.test(normalizedPath) || normalizedPath.includes('/src/tests/')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    const tableNames = collectTableNames(content);
    for (const tableName of tableNames) {
      if (isForbiddenClientD1TableName(tableName)) {
        issues.push(
          `${normalizedPath}: Client D1 must not define Agent domain snapshot table ${tableName}`
        );
      }
    }
    for (const forbiddenColumn of collectForbiddenClientD1SecretColumns(content)) {
      issues.push(
        `${normalizedPath}: Client D1 must not define plaintext signing material or secret column ${forbiddenColumn}`
      );
    }
  }
  return [...new Set(issues)];
}

/**
 * Client registration reconciliation metadata が Client-owned managed Agent ledger に閉じていることを検査します。
 * 入力は workspace root、出力は schema、metadata descriptor、migration の ownership 違反を示す issue 配列です。
 * Agent domain snapshot や credential secret を読み書きせず、静的な source text だけを検査します。
 */
export function collectClientRegistrationMetadataOwnershipIssues(root) {
  const issues = [];
  const schemaPath = `${root}/packages/client/src/server/db/schema.ts`;

  // schema が存在しない場合は、Client-owned registration state を分類できないため詳細解析をせず fail closed にします。
  if (!existsSync(schemaPath)) {
    return ['packages/client/src/server/db/schema.ts: missing Client registration metadata schema'];
  }

  const schema = readFileSync(schemaPath, 'utf8');
  const managedAgentTable = extractClientManagedAgentTable(schema);
  // registration metadata は Client management ledger の行だけが所有し、別 table へ横流ししてはなりません。
  for (const [propertyName, columnName] of clientRegistrationMetadata) {
    if (
      !managedAgentTable.includes(`${propertyName}:`) ||
      !managedAgentTable.includes(`'${columnName}'`)
    ) {
      issues.push(
        `packages/client/src/server/db/schema.ts: client_managed_agents must own registration metadata ${columnName}`
      );
    }
  }

  const metadataDescriptor = extractClientManagedAgentMetadataDescriptor(schema);
  // public metadata descriptor も同じ Client-owned columns を列挙し、repository/test が ownership を観測できるようにします。
  for (const [, columnName] of clientRegistrationMetadata) {
    if (!metadataDescriptor.includes(`'${columnName}'`)) {
      issues.push(
        `packages/client/src/server/db/schema.ts: client managed Agent metadata descriptor must include ${columnName}`
      );
    }
  }

  const migrationsRoot = `${root}/packages/client/src/server/db/migrations`;
  const migrationText = collectFiles(migrationsRoot)
    .filter((filePath) => filePath.endsWith('.sql'))
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n');
  // D1 deploy で同じ columns が実際に作られることを確認し、schema type だけの phantom metadata を防ぎます。
  for (const [, columnName] of clientRegistrationMetadata) {
    if (!migrationText.includes(columnName)) {
      issues.push(
        `packages/client/src/server/db/migrations: Client registration migration must define ${columnName}`
      );
    }
  }

  return [...new Set(issues)];
}

function collectTableNames(content) {
  return [
    ...content.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(["'`]?)(\w+)\1/gi),
    ...content.matchAll(/sqliteTable\(\s*["'](\w+)["']/g),
  ].map((match) => match[2] ?? match[1]);
}

function isForbiddenClientD1TableName(tableName) {
  return /^agent_(?:events|threads|runs|schedules|tool_invocations|integration_installations|adapter_connections|compactions|state|thread_memory|history)/i.test(
    tableName
  );
}

function collectForbiddenClientD1SecretColumns(content) {
  const columnNames = [
    ...content.matchAll(/^\s*(["'`]?)(\w+)\1\s+(?:text|blob|varchar|integer)\b/gim),
    ...content.matchAll(/\b(?:text|integer|blob|varchar)\(\s*["'](\w+)["']/g),
  ].map((match) => match[2] ?? match[1]);
  return columnNames.filter((columnName) => isForbiddenClientD1SecretColumn(columnName));
}

function isForbiddenClientD1SecretColumn(columnName) {
  if (columnName === 'encrypted_private_jwk') {
    return false;
  }
  return /^(?:secret|secret_material|shared_secret|private_key|private_jwk|raw_jwt|token|signing_material)$/i.test(
    columnName
  );
}

function collectBindingIssues(root) {
  const issues = [];
  const agentWrangler = readProjectFile(root, 'packages/agent/wrangler.toml');
  const clientWrangler = readProjectFile(root, 'packages/client/wrangler.toml');

  if (
    !/name\s*=\s*"AI_AGENT"/.test(agentWrangler) ||
    !/class_name\s*=\s*"AIAgent"/.test(agentWrangler)
  ) {
    issues.push(
      'packages/agent/wrangler.toml: missing AI_AGENT Durable Object binding for AIAgent'
    );
  }
  if (!/binding\s*=\s*"AGENT_BLOBS"/.test(agentWrangler)) {
    issues.push('packages/agent/wrangler.toml: missing Agent blob storage binding');
  }
  if (
    /\[\[d1_databases]]|CLIENT_DB|\[\[queues\.|queue_producers|queue_consumers/.test(agentWrangler)
  ) {
    issues.push(
      'packages/agent/wrangler.toml: Agent Worker must not define D1, CLIENT_DB, or Cloudflare Queues bindings'
    );
  }

  if (!/binding\s*=\s*"CLIENT_DB"/.test(clientWrangler)) {
    issues.push('packages/client/wrangler.toml: missing CLIENT_DB binding');
  }
  if (/AI_AGENT|AGENT_BLOBS|\[\[r2_buckets]]/.test(clientWrangler)) {
    issues.push(
      'packages/client/wrangler.toml: Client Worker must not define Agent runtime bindings'
    );
  }
  return issues;
}

/**
 * Agent Provider ingress Rate Limiting binding が production/staging の専用 100 requests/60 seconds policyであることを検査します。
 * 入力は workspace root、出力は Wrangler binding と Agent runtime type の違反を示す issue 配列です。
 * namespace ID の実値、request payload、source IP、secret は読み取らず、設定の安全な構造だけを分類します。
 */
export function collectAgentProviderIngressRateLimitIssues(root) {
  const issues = [];
  const wranglerPath = `${root}/packages/agent/wrangler.toml`;
  const envPath = `${root}/packages/agent/src/env.ts`;

  // binding config が欠けると Provider pre-auth guard を実行できないため、Wrangler file 不在を個別に報告します。
  if (!existsSync(wranglerPath)) {
    return ['packages/agent/wrangler.toml: missing Provider ingress Rate Limiting configuration'];
  }

  const wrangler = readFileSync(wranglerPath, 'utf8');
  const namespaceIds = [];
  for (const profile of providerIngressRateLimitProfiles) {
    // profile stanza を単位に読むことで、production と staging が同じ global config を暗黙共有しないようにします。
    const profileConfig = extractTomlArrayTable(wrangler, profile.section);
    const namespaceId = readProviderRateLimitNamespaceId(profileConfig);
    if (!isProviderRateLimitProfile(profileConfig) || namespaceId === undefined) {
      issues.push(
        `packages/agent/wrangler.toml: ${profile.label} must define ${providerIngressRateLimitBindingName} with a dedicated positive namespace_id and 100/60 policy`
      );
      continue;
    }
    namespaceIds.push(namespaceId);
  }

  // production/staging が同じ namespace を使うと counter を分離できないため、両 profile が揃った場合だけ比較します。
  if (
    namespaceIds.length === providerIngressRateLimitProfiles.length &&
    new Set(namespaceIds).size !== namespaceIds.length
  ) {
    issues.push(
      'packages/agent/wrangler.toml: Provider ingress Rate Limiting production and staging namespace_id values must differ'
    );
  }

  // Agent runtime が optional/unknown binding を扱わないよう、required RateLimit type を source から確認します。
  if (
    !existsSync(envPath) ||
    !new RegExp(`readonly\\s+${providerIngressRateLimitBindingName}\\s*:\\s*RateLimit`).test(
      readFileSync(envPath, 'utf8')
    )
  ) {
    issues.push(
      `packages/agent/src/env.ts: Agent worker bindings must require ${providerIngressRateLimitBindingName}: RateLimit`
    );
  }

  return [...new Set(issues)];
}

/**
 * Client Service JWT aggregate と Provider detached-signature aggregate が SDK source import graph で混在しないことを検査します。
 * 入力は workspace root、出力は Provider/Client Service authentication boundary の違反を示す issue 配列です。
 * generated descriptors と root re-export は対象外とし、各 server-side aggregate の implementation import だけを検査します。
 */
export function collectSdkAuthenticationAggregateBoundaryIssues(root) {
  const issues = [];

  // Provider ingress surface は Client Service JWT/key context を import せず、detached-signature identity に閉じます。
  for (const relativePath of providerSdkSourcePaths) {
    const filePath = `${root}/${relativePath}`;
    if (!existsSync(filePath)) {
      issues.push(`${relativePath}: missing Provider SDK authentication boundary source`);
      continue;
    }
    const imports = collectResolvedImports(root, filePath);
    if (imports.some((importedPath) => isClientServiceSdkAuthenticationPath(importedPath))) {
      issues.push(
        `${relativePath}: Provider SDK aggregate must not import Client Service JWT or signing context`
      );
    }
  }

  // Client Service aggregate は Provider signer/ingress transport を import せず、JWT execution context を維持します。
  for (const relativePath of clientServiceSdkSourcePaths) {
    const filePath = `${root}/${relativePath}`;
    if (!existsSync(filePath)) {
      issues.push(`${relativePath}: missing Client Service SDK authentication boundary source`);
      continue;
    }
    const imports = collectResolvedImports(root, filePath);
    if (imports.some((importedPath) => isProviderSdkAuthenticationPath(importedPath))) {
      issues.push(
        `${relativePath}: Client Service SDK aggregate must not import Provider ingress signing or transport context`
      );
    }
  }

  return [...new Set(issues)];
}

function collectOpenCodeWorkflowIssues(root) {
  const files = Object.fromEntries(
    workflowFiles.map((relativePath) => [relativePath, readProjectFile(root, relativePath)])
  );
  return collectOpenCodeWorkflowIssuesFromFiles(files);
}

export function collectOpenCodeWorkflowIssuesFromFiles(files) {
  const issues = [];
  const corpus = Object.values(files).join('\n');

  const mustMentionAgent = [
    '.opencode/skills/coding-guardian/SKILL.md',
    '.opencode/skills/coding-guardian/references/repo-entrypoints.md',
    '.opencode/agents/openspec/applier.md',
    '.opencode/agents/unit/agent/engineer.md',
    '.opencode/agents/unit/agent/reviewer.md',
    '.opencode/agents/unit/build/builder.md',
    '.opencode/agents/unit/build/reviewer.md',
  ];

  const mustMentionClient = [
    '.opencode/skills/coding-guardian/SKILL.md',
    '.opencode/skills/coding-guardian/references/repo-entrypoints.md',
    '.opencode/agents/openspec/applier.md',
    '.opencode/agents/unit/client/engineer.md',
    '.opencode/agents/unit/client/reviewer.md',
    '.opencode/agents/unit/build/builder.md',
    '.opencode/agents/unit/build/reviewer.md',
  ];

  for (const relativePath of mustMentionAgent) {
    if (!files[relativePath]?.includes('packages/agent/**')) {
      issues.push(`${relativePath}: missing packages/agent/** scope`);
    }
  }

  for (const relativePath of mustMentionClient) {
    if (!files[relativePath]?.includes('packages/client/**')) {
      issues.push(`${relativePath}: missing packages/client/** scope`);
    }
  }

  if (corpus.includes('unit/backend/') || corpus.includes('unit/frontend/')) {
    issues.push('workflow references removed backend/frontend unit agents');
  }

  for (const generatedPath of generatedPolicyPaths) {
    if (!corpus.includes(generatedPath)) {
      issues.push(`missing generated output policy for ${generatedPath}`);
    }
  }
  if (!containsAny(corpus, ['command-owned', 'command owned'])) {
    issues.push('missing command-owned generated output wording');
  }
  if (!containsAny(corpus, ['hand-edit', 'hand edit', '手編集'])) {
    issues.push('missing generated output hand-edit prohibition');
  }
  if (!corpus.includes('scripts/governance/verify-package-boundaries.mjs')) {
    issues.push('missing governance boundary script entrypoint');
  }
  if (!corpus.includes('scripts/governance/verify-agent-surface.mjs')) {
    issues.push('missing governance Agent surface script entrypoint');
  }
  if (!corpus.includes('scripts/openspec/verify-scenario-coverage.mjs')) {
    issues.push('missing OpenSpec scenario coverage entrypoint');
  }
  if (
    /old demo package/i.test(corpus) &&
    !corpus.includes('packages/agent/**') &&
    !corpus.includes('packages/client/**')
  ) {
    issues.push('workflow remains demo-only guidance');
  }
  return issues;
}

function collectResolvedImports(root, filePath) {
  const content = readFileSync(filePath, 'utf8');
  return collectImportSpecifiers(content).map((specifier) =>
    resolveImportSpecifier(root, filePath, specifier)
  );
}

function collectImportSpecifiers(content) {
  return [...content.matchAll(/(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g)].map(
    (match) => match[1]
  );
}

function resolveImportSpecifier(root, filePath, specifier) {
  if (!specifier.startsWith('.')) {
    return specifier;
  }
  return normalizePath(root, resolve(dirname(filePath), specifier));
}

function isAgentRuntimeFoundationPath(normalizedPath) {
  return (
    isAgentApplicationPath(normalizedPath) ||
    isAgentDomainRuntimePath(normalizedPath) ||
    isAgentStoragePath(normalizedPath) ||
    normalizedPath.startsWith('/packages/agent/src/observability/')
  );
}

function isAgentApplicationPath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/application/');
}

function isAgentDomainPath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/domain/');
}

function isAgentStoragePath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/storage/');
}

function isAgentDurableObjectLayerPath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/durable-object/');
}

function isAgentDurableObjectPath(normalizedPath) {
  return isAgentDurableObjectLayerPath(normalizedPath) || isAgentDoRuntimePath(normalizedPath);
}

function isAgentDomainRuntimePath(normalizedPath) {
  return [
    '/packages/agent/src/domain/',
    '/packages/agent/src/harness/',
    '/packages/agent/src/threads/',
    '/packages/agent/src/events/',
    '/packages/agent/src/runs/',
    '/packages/agent/src/compactions/',
    '/packages/agent/src/schedules/',
    '/packages/agent/src/tools/',
    '/packages/agent/src/integrations/',
    '/packages/agent/src/adapters/',
  ].some((prefix) => hasPathPrefix(normalizedPath, prefix));
}

function isAgentDoRuntimePath(normalizedPath) {
  return (
    normalizedPath === '/packages/agent/src/AIAgent' ||
    normalizedPath === '/packages/agent/src/AIAgent.ts' ||
    normalizedPath.startsWith('/packages/agent/src/AIAgent.')
  );
}

function isAgentRpcPath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/rpc/');
}

function isAgentRpcFacadePath(normalizedPath) {
  return isAgentRpcRouterPath(normalizedPath) || isAgentRpcAdapterPath(normalizedPath);
}

function isAgentRpcServicePath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/rpc/services/');
}

function isAgentRpcRouterPath(normalizedPath) {
  return ['/packages/agent/src/rpc/router', '/packages/agent/src/rpc/router.ts'].includes(
    normalizedPath
  );
}

function isAgentRpcAdapterPath(normalizedPath) {
  return [
    '/packages/agent/src/rpc/connect-worker-adapter',
    '/packages/agent/src/rpc/connect-worker-adapter.ts',
  ].includes(normalizedPath);
}

function isAgentRpcInterceptorPath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/rpc/interceptors/');
}

function isAgentRpcDispatchPath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/rpc/dispatch/');
}

function isAgentRpcMapperPath(normalizedPath) {
  return hasPathPrefix(normalizedPath, '/packages/agent/src/rpc/mappers/');
}

function isAgentRoutingPath(normalizedPath) {
  return ['/packages/agent/src/agent-routing', '/packages/agent/src/agent-routing.ts'].includes(
    normalizedPath
  );
}

function isAgentGeneratedRpcPath(normalizedPath) {
  return (
    normalizedPath === '@cf-tamac/agent-rpc' ||
    normalizedPath.startsWith('@cf-tamac/agent-rpc/') ||
    normalizedPath === '@cf-tamac/client-agent-rpc' ||
    normalizedPath.startsWith('@cf-tamac/client-agent-rpc/') ||
    hasPathPrefix(normalizedPath, '/packages/agent/src/generated/rpc/') ||
    hasPathPrefix(normalizedPath, '/packages/client/src/generated/agent-rpc/')
  );
}

function isForbiddenSdkRuntimeImport(importedPath) {
  return [
    '@cf-tamac/agent',
    '@cf-tamac/client',
    '@cf-tamac/agent-rpc',
    '@cf-tamac/client-agent-rpc',
    '/packages/agent/src/',
    '/packages/client/src/',
  ].some(
    (prefix) =>
      importedPath === prefix ||
      importedPath.startsWith(`${prefix}/`) ||
      importedPath.startsWith(prefix)
  );
}

function isForbiddenClientBrowserImport(importedPath) {
  return (
    importedPath.startsWith('/packages/client/src/server/') ||
    importedPath === 'server-only' ||
    importedPath.startsWith('@cf-tamac/client-agent-rpc') ||
    importedPath.startsWith('@connectrpc/connect') ||
    importedPath === '@cf-tamac/sdk' ||
    importedPath.startsWith('@cf-tamac/sdk/') ||
    importedPath === '@cf-tamac/sdk-agent-rpc' ||
    importedPath.startsWith('@cf-tamac/sdk-agent-rpc/') ||
    importedPath === '/packages/sdk' ||
    importedPath.startsWith('/packages/sdk/')
  );
}

function hasSdkDescriptorExports(packageManifest) {
  if (!isRecord(packageManifest.exports)) {
    return false;
  }
  return (
    packageManifest.exports['.'] === './src/index.ts' &&
    packageManifest.exports[sdkDescriptorExportPath] === sdkDescriptorExportTarget
  );
}

function extractClientManagedAgentTable(content) {
  // Drizzle schema の managed Agent table block だけを抽出し、別 Client table の同名 column では ownership を満たしません。
  const tableStart = content.indexOf("sqliteTable('client_managed_agents'");
  if (tableStart === -1) {
    return '';
  }
  const tableEnd = content.indexOf('});', tableStart);
  return tableEnd === -1 ? content.slice(tableStart) : content.slice(tableStart, tableEnd + 3);
}

function extractClientManagedAgentMetadataDescriptor(content) {
  // public descriptor block を table schema と別に抽出し、runtime schema と test/documentation contract の双方を検査します。
  return (
    /export const clientManagedAgentsTableMetadata\s*=\s*{[\S\s]*?}\s*as const/m.exec(
      content
    )?.[0] ?? ''
  );
}

function extractTomlArrayTable(content, section) {
  // target array-table から次の array-table 手前までを切り出し、nested simple policy も同じ profile の設定として保持します。
  const start = content.indexOf(section);
  if (start === -1) {
    return '';
  }
  const nextArrayTable = content.indexOf('\n[[', start + section.length);
  return nextArrayTable === -1 ? content.slice(start) : content.slice(start, nextArrayTable);
}

function isProviderRateLimitProfile(content) {
  // binding 名、namespace、simple policy を同じ profile block で検査し、別環境の設定を誤って合成しません。
  return (
    new RegExp(`name\\s*=\\s*"${providerIngressRateLimitBindingName}"`).test(content) &&
    /\[.*ratelimits\.simple][\S\s]*?limit\s*=\s*100[\S\s]*?period\s*=\s*60/.test(content)
  );
}

function readProviderRateLimitNamespaceId(content) {
  // namespace ID は Cloudflare account が発行する正整数文字列だけを許可し、空値や placeholder を設定として扱いません。
  return /namespace_id\s*=\s*"([1-9]\d*)"/.exec(content)?.[1];
}

function isClientServiceSdkAuthenticationPath(importedPath) {
  // Provider aggregate が Client Service JWT/signing context へ到達する import prefix だけを静的に禁止します。
  return (
    hasPathPrefix(importedPath, '/packages/sdk/src/auth/client-service-jwt') ||
    hasPathPrefix(importedPath, '/packages/sdk/src/auth/types') ||
    hasPathPrefix(importedPath, '/packages/sdk/src/client') ||
    hasPathPrefix(importedPath, '/packages/sdk/src/transport')
  );
}

function isProviderSdkAuthenticationPath(importedPath) {
  // Client Service aggregate が Provider signer/transport context へ到達する import prefix だけを静的に禁止します。
  return (
    hasPathPrefix(importedPath, '/packages/sdk/src/provider-ingress') ||
    hasPathPrefix(importedPath, '/packages/sdk/src/provider-ingress-transport') ||
    hasPathPrefix(importedPath, '/packages/sdk/src/provider-ingress-types')
  );
}

function readJsonRecord(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Buf の plugins stanza に SDK descriptor を出力する Protobuf-ES target が存在するかを検査します。
 * 入力は `buf.gen.yaml` の文字列、出力は SDK target を持つ plugin がある場合だけ true です。
 * YAML text の読み取りと限定的な stanza 解析だけを行い、Buf config や generated output を変更しません。
 */
function hasSdkBufGenerationTarget(content) {
  // コメントや別の YAML key に偶然 target 文字列があっても通さないため、plugins stanza を意味単位で抽出します。
  return collectBufPluginStanzas(content).some(
    (plugin) => plugin.local === 'protoc-gen-es' && plugin.out === sdkBufGenerationTarget
  );
}

/**
 * Buf v2 configuration の top-level plugins sequence を plugin ごとの local/out record として抽出します。
 * 入力は YAML text、出力は plugins 配下の stanza だけを順序どおり保持する record 配列です。
 * comments、top-level の別 key、plugin 外の `out` は対象外とし、入力文字列を変更しません。
 */
function collectBufPluginStanzas(content) {
  const plugins = [];
  let isInPlugins = false;
  let plugin;

  for (const sourceLine of content.split('\n')) {
    // 空行と full-line comment は YAML の structure を持たないため、target 判定の入力から除外します。
    const trimmedLine = sourceLine.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }

    // top-level `plugins:` だけを collector の開始点にし、同名文字列を含む nested value を受理しません。
    if (!isInPlugins) {
      isInPlugins = trimmedLine === 'plugins:' && sourceLine === 'plugins:';
      continue;
    }

    // 次の top-level key に達したら plugins sequence を閉じ、以降の `out` は誤配置として無視します。
    if (!sourceLine.startsWith(' ')) {
      break;
    }

    const pluginStart = sourceLine.match(/^ {2}- (?<key>[A-Z_a-z]+):\s*(?<value>\S.*?)\s*$/);
    if (pluginStart) {
      // 新しい sequence item を record 化し、同じ stanza の nested property だけを後続で関連付けます。
      plugin = { [pluginStart.groups.key]: pluginStart.groups.value };
      plugins.push(plugin);
      continue;
    }

    const pluginProperty = sourceLine.match(/^ {4}(?<key>[A-Z_a-z]+):\s*(?<value>\S.*?)\s*$/);
    if (plugin !== undefined && pluginProperty) {
      // `out` が plugin stanza に属することを保証するため、現在の record にのみ nested property を追加します。
      plugin[pluginProperty.groups.key] = pluginProperty.groups.value;
    }
  }

  return plugins;
}

function isAgentWorkerEntrypointPath(normalizedPath) {
  return [
    '/packages/agent/src/index',
    '/packages/agent/src/index.ts',
    '/packages/agent/src/worker',
    '/packages/agent/src/worker.ts',
  ].includes(normalizedPath);
}

function hasPathPrefix(normalizedPath, prefix) {
  return normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix);
}

function isForbiddenAgentLowerLayerExternal(normalizedPath, importedPath) {
  if (
    normalizedPath.startsWith('/packages/agent/src/storage/') &&
    (importedPath === 'drizzle-orm' || importedPath.startsWith('drizzle-orm/'))
  ) {
    return false;
  }
  return (
    [
      'hono',
      '@hono/zod-openapi',
      '@connectrpc/connect',
      'next',
      'react',
      'server-only',
      'drizzle-orm',
    ].some((specifier) => importedPath === specifier || importedPath.startsWith(`${specifier}/`)) ||
    importedPath.startsWith('@cloudflare/') ||
    importedPath.startsWith('cloudflare:')
  );
}

function isClientBrowserVisiblePath(normalizedPath, content) {
  if (normalizedPath.startsWith('/packages/client/app/')) {
    return true;
  }
  if (normalizedPath.startsWith('/packages/client/src/server/')) {
    return false;
  }
  return (
    normalizedPath.startsWith('/packages/client/src/') ||
    /^["']use client["'];?/.test(content.trimStart())
  );
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function readProjectFile(root, relativePath) {
  return readFileSync(`${root}/${relativePath}`, 'utf8');
}

function collectFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const entries = readdirSync(root).sort();
  const files = [];
  for (const entry of entries) {
    const fullPath = `${root}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizePath(root, filePath) {
  return filePath.replace(root, '').replaceAll('\\', '/');
}

function main() {
  const issues = collectPackageBoundaryIssues();
  if (issues.length > 0) {
    process.stderr.write(
      `Package boundary governance failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
