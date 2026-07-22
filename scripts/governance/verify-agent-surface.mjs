import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

import ts from 'typescript';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

const scanRoots = [
  'packages/agent',
  'packages/client/app',
  'packages/client/src/server/agent-rpc',
  'packages/sdk',
];
const sdkRuntimeRoot = 'packages/sdk/src';
const sdkGeneratedDescriptorRoot = `${sdkRuntimeRoot}/generated/agent-rpc`;
const ignoredPathFragments = [
  '/.next/',
  '/.wrangler/',
  '/dist/',
  '/node_modules/',
  '/src/generated/',
  '/src/tests/',
];
const inspectableFilePattern = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|proto|tsp|toml|ya?ml)$/;

const guardrails = {
  agentHealth: {
    concern:
      'Agent health must use AgentHealthService.Check over Connect binary Protobuf; REST /health or JSON health splits the RPC guardrail',
    scenario: 'AGENT-HEALTH-S002',
  },
  agentSecurity: {
    concern:
      'Agent public operations must stay behind the Connect facade; REST, Hono, OpenAPI/Orval, JSON DTO, or public Durable Object routes bypass authentication and final authorization',
    scenario: 'AGENT-SECURITY-S009',
  },
  clientRegistry: {
    concern:
      'Client must not expose public Agent proxy API routes; Agent operations stay behind Server Actions or Server Components',
    scenario: 'CLIENT-REGISTRY-S005',
  },
  productionAuth: {
    concern:
      'Production Agent Client Service authentication must use Ed25519 JWT and AGENT_CONTROL_PLANE_TRUST, not JSON auth routes, bootstrap trust, AgentTrustRegistry, or manually pasted Client private signing keys',
    scenario: 'WORKSPACE-GOVERNANCE-S011',
  },
};

const forbiddenSourcePatterns = [
  {
    name: 'hono-rest-route',
    pattern: /from ["']hono["']|new Hono\b|\.get\(["']\/|\.post\(["']\//,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'openapi-surface',
    pattern: /@hono\/zod-openapi|openapihono|createroute|openapi\.json|swagger/i,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'orval-agent-client',
    pattern: /\borval\b/i,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'ad-hoc-json-agent-api',
    pattern: /Response\.json\(|\.json\(\s*{/,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'public-do-rpc-route',
    pattern:
      /ai_agent[\S\s]{0,300}\.get\([\S\s]{0,300}\)\.fetch\(|\/(?:__do_rpc|do-rpc|durable-object-rpc|agents?\/[^"'`]*\/(?:do|rpc))/i,
    guardrail: guardrails.agentSecurity,
  },
  {
    name: 'rest-health-endpoint',
    pattern:
      /["'`]\/health["#'/?`]|pathname\s*={2,3}\s*["'`]\/health|urlpattern[\S\s]{0,120}\/health/i,
    guardrail: guardrails.agentHealth,
  },
  {
    name: 'json-health-response',
    pattern:
      /response\.json\(\s*{[\S\s]{0,160}(?:health|ok|serving|status)|application\/json[\S\s]{0,160}health/i,
    guardrail: guardrails.agentHealth,
  },
  {
    name: 'agent-rest-json-auth-route',
    pattern:
      /\b(?:[$_a-z][\w$]*|new\s+[$_a-z][\w$]*\([^)]*\))\s*\.\s*(?:get|post|put|patch)\(["'][^"']*\/[^"']*(?:auth|jwt|token|credential|bootstrap)|response\.json\([\S\s]{0,240}(?:auth|jwt|token|credential)|application\/json[\S\s]{0,240}(?:auth|jwt|token|credential)/i,
    guardrail: guardrails.productionAuth,
  },
  {
    name: 'bootstrap-rpc-trust-source',
    pattern:
      /\b(?:Bootstrap(?:Agent|Trust|Credential|ControlPlane)\w*|bootstrap(?:Agent|Trust|Credential|ControlPlane|Rpc|RPC|Token)\w*|rpc\s+\w*Bootstrap\w*)\b/,
    guardrail: guardrails.productionAuth,
  },
  {
    name: 'agent-trust-registry',
    pattern: /\bAgentTrustRegistry\b/,
    guardrail: guardrails.productionAuth,
  },
  {
    name: 'client-private-key-worker-secret',
    pattern:
      /\b(?:client_(?:private_)?signing_key|client_service_private_jwk|client_private_jwk|client_signing_private_jwk)\b|wrangler\s+secret\s+put[\S\s]{0,120}(?:private_jwk|signing_private|client_service_private)/i,
    guardrail: guardrails.productionAuth,
  },
];

const clientPublicProxyPathPattern =
  /^\/packages\/client\/app\/api\/(?:agent|agents|client)(?:\/|$)|^\/packages\/client\/app\/api\/.*(?:agent|rpc|proxy)/i;

const clientPublicProxyContentPatterns = [
  /export\s+async\s+function\s+(?:get|post|put|patch|delete)[\S\s]{0,500}(?:agent|rpc|proxy)/i,
  /@connectrpc\/connect|@cf-tamac\/client-agent-rpc|createServerAgentRpcClients|agentRpcOrigin|agent_rpc_origin/,
];

/**
 * Collect forbidden public Agent API surface issues.
 */
export function collectAgentSurfaceIssues(root = projectRoot) {
  const issues = [];
  for (const relativeRoot of scanRoots) {
    for (const filePath of collectFiles(`${root}/${relativeRoot}`)) {
      const normalizedPath = filePath.replace(root, '').replaceAll('\\', '/');
      if (ignoredPathFragments.some((fragment) => normalizedPath.includes(fragment))) {
        continue;
      }
      inspectAgentSurfaceFile(filePath, normalizedPath, issues);
    }
  }
  // SDK は Agent public surface の typed server-side consumer なので、generated descriptor と Connect binary profile の両方を検査します。
  issues.push(...collectSdkAgentRpcSurfaceIssues(root));
  return [...new Set(issues)];
}

/**
 * Collect SDK Agent RPC surface issues when the SDK package is present in the scanned root.
 */
export function collectSdkAgentRpcSurfaceIssues(root) {
  const sdkSourceRootPath = `${root}/${sdkRuntimeRoot}`;
  // Agent/Client-only fixture は従来どおり独立して検査できるよう、SDK package がない root では追加 issue を出しません。
  if (!existsSync(sdkSourceRootPath)) {
    return [];
  }

  const sdkSourceFiles = collectFiles(sdkSourceRootPath).filter((filePath) => {
    const normalizedPath = filePath.replace(root, '').replaceAll('\\', '/');
    return (
      inspectableFilePattern.test(normalizedPath) &&
      !normalizedPath.includes('/src/generated/') &&
      !normalizedPath.includes('/src/tests/')
    );
  });
  const sdkImports = sdkSourceFiles.flatMap((filePath) =>
    collectImportSpecifiers(readFileSync(filePath, 'utf8'))
  );
  const issues = [];

  // Connect core client は generated service descriptor を typed unary RPC client に束ねる唯一の SDK runtime です。
  if (!sdkImports.includes('@connectrpc/connect')) {
    issues.push('/packages/sdk/src: SDK Agent RPC surface must import @connectrpc/connect');
  }
  // Connect web transport は binary Protobuf profile を実際の HTTP request に反映する runtime seam です。
  if (!sdkImports.includes('@connectrpc/connect-web')) {
    issues.push('/packages/sdk/src: SDK Agent RPC surface must import @connectrpc/connect-web');
  }
  // SDK package 内で生成された descriptor だけを使うことで、Agent/Client descriptor を横断して import する経路を作りません。
  if (!sdkImports.some((specifier) => isSdkGeneratedDescriptorImport(specifier))) {
    issues.push(
      '/packages/sdk/src: SDK Agent RPC surface must import its generated Protobuf RPC descriptor'
    );
  }
  // descriptor output 自体がなければ import string だけでは contract consumer を保証できないため、canonical generated root を確認します。
  if (
    !existsSync(`${root}/${sdkGeneratedDescriptorRoot}`) ||
    !collectFiles(`${root}/${sdkGeneratedDescriptorRoot}`).some((filePath) =>
      filePath.endsWith('.ts')
    )
  ) {
    issues.push(
      '/packages/sdk/src/generated/agent-rpc: SDK generated Protobuf RPC descriptor is missing'
    );
  }
  // binary format と GET disable は各 transport factory の options に直接指定させ、別の decoy object で検査を通せないようにします。
  issues.push(...collectConnectTransportProfileIssues(sdkSourceFiles));
  return issues;
}

function inspectAgentSurfaceFile(filePath, normalizedPath, issues) {
  if (/openapi|orval/i.test(normalizedPath)) {
    issues.push(
      formatIssue(
        normalizedPath,
        guardrails.agentSecurity,
        'forbidden Agent OpenAPI/Orval artifact path'
      )
    );
  }
  if (clientPublicProxyPathPattern.test(normalizedPath)) {
    issues.push(
      formatIssue(
        normalizedPath,
        guardrails.clientRegistry,
        'forbidden Client public Agent proxy route path'
      )
    );
  }
  if (!inspectableFilePattern.test(normalizedPath)) {
    return;
  }
  const content = readFileSync(filePath, 'utf8');
  if (isClientPublicRouteFile(normalizedPath) && hasClientPublicProxyContent(content)) {
    issues.push(
      formatIssue(
        normalizedPath,
        guardrails.clientRegistry,
        'forbidden Client public Agent proxy route'
      )
    );
  }
  for (const rule of forbiddenSourcePatterns) {
    // Orval 以外の rule は既存どおり file 全体を検査し、REST/JSON/auth route の検出範囲を狭めません。
    const isForbiddenOrvalSource =
      rule.name === 'orval-agent-client' && containsOrvalSourceToken(filePath, content);
    if (
      isForbiddenOrvalSource ||
      (rule.name !== 'orval-agent-client' && rule.pattern.test(content))
    ) {
      issues.push(formatIssue(normalizedPath, rule.guardrail, `forbidden ${rule.name}`));
    }
  }
}

function formatIssue(normalizedPath, guardrail, detail) {
  return `${normalizedPath}: [${guardrail.scenario}] ${guardrail.concern}: ${detail}`;
}

function isClientPublicRouteFile(normalizedPath) {
  return (
    normalizedPath.startsWith('/packages/client/app/api/') &&
    /\/route\.(?:ts|js)$/.test(normalizedPath)
  );
}

function hasClientPublicProxyContent(content) {
  return clientPublicProxyContentPatterns.some((pattern) => pattern.test(content));
}

function collectImportSpecifiers(content) {
  return [...content.matchAll(/(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g)].map(
    (match) => match[1]
  );
}

function isSdkGeneratedDescriptorImport(specifier) {
  return (
    specifier.includes('/generated/agent-rpc/') ||
    specifier === '@cf-tamac/sdk-agent-rpc' ||
    specifier.startsWith('@cf-tamac/sdk-agent-rpc/')
  );
}

function collectConnectTransportProfileIssues(sdkSourceFiles) {
  const { hasShadowedBinding, transportCalls } =
    collectConnectTransportCallArguments(sdkSourceFiles);
  // Connect runtime を import するだけで transport を作らない SDK は Agent RPC consumer になれないため fail closed にします。
  if (hasShadowedBinding || transportCalls.length === 0) {
    return [
      '/packages/sdk/src: SDK Agent RPC surface must configure every createConnectTransport() call with useBinaryFormat: true and useHttpGet: false',
    ];
  }
  // AST 上の実 CallExpression ごとに options を確認し、文字列・comment・正規表現内の decoy を呼出しとして数えません。
  const hasInvalidTransportProfile = transportCalls.some((call) => {
    if (call.arguments.length !== 1) {
      return true;
    }
    const [options] = call.arguments;
    if (options === undefined || !ts.isObjectLiteralExpression(options)) {
      return true;
    }
    // spread は runtime 値で binary/GET invariant を上書きできるため、direct object property だけを許可します。
    if (options.properties.some((property) => ts.isSpreadAssignment(property))) {
      return true;
    }
    return (
      getSingleBooleanProperty(options, 'useBinaryFormat') !== true ||
      getSingleBooleanProperty(options, 'useHttpGet') !== false
    );
  });
  return hasInvalidTransportProfile
    ? [
        '/packages/sdk/src: SDK Agent RPC surface must configure every createConnectTransport() call with useBinaryFormat: true and useHttpGet: false',
      ]
    : [];
}

function collectConnectTransportCallArguments(sdkSourceFiles) {
  const transportCalls = [];
  let hasShadowedBinding = false;
  for (const filePath of sdkSourceFiles) {
    const sourceFile = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    // Connect Web named import がない file の同名 call は trusted transport factory と見なさず、collect 対象にしません。
    const transportBindingNames = collectConnectWebTransportBindingNames(sourceFile);
    if (transportBindingNames.size === 0) {
      continue;
    }
    // 同名の local declaration は import binding を shadow し得るため、source file 全体を fail closed にします。
    if (hasShadowedConnectTransportBinding(sourceFile, transportBindingNames)) {
      hasShadowedBinding = true;
      continue;
    }
    const visit = (node) => {
      // import binding 名に一致する direct CallExpression だけを collect し、string/template/regex 内の名称を除外します。
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        transportBindingNames.has(node.expression.text)
      ) {
        transportCalls.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { hasShadowedBinding, transportCalls };
}

function collectConnectWebTransportBindingNames(sourceFile) {
  const bindingNames = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@connectrpc/connect-web'
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    for (const element of namedBindings.elements) {
      // alias import も imported symbol を確認した上で local binding 名を登録し、意図しない同名 global を許可しません。
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'createConnectTransport') {
        bindingNames.add(element.name.text);
      }
    }
  }
  return bindingNames;
}

function hasShadowedConnectTransportBinding(sourceFile, transportBindingNames) {
  let hasShadowedBinding = false;
  const visit = (node) => {
    // import specifier 自体は trusted binding の宣言なので除外し、function/variable/parameter/class/binding pattern の同名宣言だけを shadow と扱います。
    if (!ts.isImportSpecifier(node) && isTransportBindingDeclaration(node, transportBindingNames)) {
      hasShadowedBinding = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hasShadowedBinding;
}

function isTransportBindingDeclaration(node, transportBindingNames) {
  const declarationName = getDeclarationName(node);
  return declarationName !== undefined && transportBindingNames.has(declarationName);
}

function getDeclarationName(node) {
  if (
    (ts.isVariableDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  return undefined;
}

function getSingleBooleanProperty(options, propertyName) {
  const matchingProperties = options.properties.filter(
    (property) =>
      ts.isPropertyAssignment(property) && getPropertyNameText(property.name) === propertyName
  );
  // duplicate property や shorthand/variable expression は最終値を安全に証明できないため undefined として fail closed にします。
  if (matchingProperties.length !== 1) {
    return undefined;
  }
  const [property] = matchingProperties;
  if (property === undefined || !ts.isPropertyAssignment(property)) {
    return undefined;
  }
  if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  return undefined;
}

function getPropertyNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

function containsOrvalSourceToken(filePath, source) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  let containsOrval = false;
  const visit = (node) => {
    // identifier、module string、template、regular expression を AST token として評価し、comment prose は source node を持たないため除外します。
    if (
      (ts.isIdentifier(node) ||
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      /\borval\b/i.test(node.text)
    ) {
      containsOrval = true;
    }
    if (
      node.kind === ts.SyntaxKind.RegularExpressionLiteral &&
      /\borval\b/i.test(node.getText(sourceFile))
    ) {
      containsOrval = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return containsOrval;
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

function main() {
  const issues = collectAgentSurfaceIssues();
  if (issues.length > 0) {
    process.stderr.write(
      `Agent surface governance failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}\n`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
