import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import eslintComments from 'eslint-plugin-eslint-comments';
import importPlugin from 'eslint-plugin-import';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

import maxlinesConfig from './.eslintrc-maxlines.json' with { type: 'json' };

const compat = new FlatCompat();

const exportTsdocPlugin = {
  rules: {
    'require-export-tsdoc': {
      meta: {
        type: 'problem',
        docs: { description: 'Require TSDoc comments for exported declarations.' },
        schema: [],
        messages: {
          missing:
            'エクスポートする{{target}}には直前に TSDoc コメント (/** ... */) を付けてください。',
        },
      },
      create(context) {
        const sourceCode = context.getSourceCode();

        const isTsdocCommentBefore = (node) => {
          const comments = sourceCode.getCommentsBefore(node);
          const last = comments.at(-1);
          if (last === undefined) return false;
          return (
            node.loc.start.line - last.loc.end.line <= 1 &&
            last.type === 'Block' &&
            last.value.startsWith('*')
          );
        };

        const hasTsdocComment = (node) => {
          if (isTsdocCommentBefore(node)) return true;
          const parent = node.parent;
          if (
            parent !== undefined &&
            (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportDefaultDeclaration')
          ) {
            return isTsdocCommentBefore(parent);
          }
          return false;
        };

        const reportIfMissing = (targetNode, label) => {
          if (hasTsdocComment(targetNode)) return;
          context.report({ node: targetNode, messageId: 'missing', data: { target: label } });
        };

        const getExportInfo = (node) => {
          const decl = node.declaration;
          if (decl === null) return null;
          switch (decl.type) {
            case 'FunctionDeclaration':
              return { target: decl, label: '関数' };
            case 'ClassDeclaration':
              return { target: decl, label: 'クラス' };
            case 'TSEnumDeclaration':
              return { target: decl, label: 'enum' };
            case 'TSInterfaceDeclaration':
              return { target: decl, label: 'インターフェース' };
            case 'TSTypeAliasDeclaration':
              return { target: decl, label: '型' };
            case 'VariableDeclaration':
              return { target: decl, label: '変数/定数' };
            default:
              return { target: decl, label: '値' };
          }
        };

        const getDefaultExportInfo = (node) => {
          const decl = node.declaration;
          if (decl === null) return null;
          return { target: decl.type === 'Identifier' ? node : decl, label: 'default export' };
        };

        return {
          ExportNamedDeclaration(node) {
            const info = getExportInfo(node);
            if (info !== null) reportIfMissing(info.target, info.label);
          },
          ExportDefaultDeclaration(node) {
            const info = getDefaultExportInfo(node);
            if (info !== null) reportIfMissing(info.target, info.label);
          },
        };
      },
    },
  },
};

const agentNoClientOrRestRule = {
  paths: [
    {
      name: '@hono/zod-openapi',
      message:
        'Agent API は Protobuf RPC-only です。OpenAPI route helpers を追加しないでください。',
    },
    {
      name: 'hono',
      importNames: ['Hono'],
      message:
        'Agent Worker に REST route surface を追加せず、Connect RPC facade を使ってください。',
    },
  ],
  patterns: [
    {
      group: [
        '@cf-tamac/client',
        '@cf-tamac/client/**',
        '@cf-tamac/client-agent-rpc',
        '@cf-tamac/client-agent-rpc/**',
        'packages/client/**',
        '../client/**',
        '../../client/**',
      ],
      message: 'Agent runtime から Client runtime/source を参照しないでください。',
    },
    {
      group: ['**/openapi/**', '**/orval/**', '**/*openapi*', '**/*orval*'],
      message: 'Agent public contract に OpenAPI / Orval surface を追加しないでください。',
    },
  ],
};

const clientNoAgentRuntimePatterns = [
  {
    group: [
      '@cf-tamac/agent',
      '@cf-tamac/agent/**',
      'packages/agent/src/**',
      '../agent/**',
      '../../agent/**',
    ],
    message:
      'Client runtime は Agent runtime source を import せず、generated Agent RPC code と Connect runtime だけを使ってください。',
  },
];

const packageTestGlobs = ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'];

const generatedSourceGlobs = [
  'packages/agent/src/generated/**/*.{ts,tsx}',
  'packages/client/src/generated/**/*.{ts,tsx}',
  'packages/sdk/src/generated/agent-rpc/**/*.{ts,tsx}',
];

// Agent 新レイヤーの import 制約は ESLint の raw specifier に対して評価されるため、
// src 配下の複数階層から同じ境界へ届く相対 import を同じ手順で列挙する。
const agentLayerImportPatterns = (...targets) =>
  targets.flatMap((target) =>
    ['..', '../..', '../../..', '../../../..'].flatMap((prefix) => [
      `${prefix}/${target}`,
      `${prefix}/${target}.ts`,
      `${prefix}/${target}/**`,
    ])
  );

// Phase 0 時点で domain から storage repository 型を受け取る既存ファイルだけを狭く許可し、
// 新規 domain ファイルへ storage 依存の例外が広がらないようにする。
const agentDomainStorageImportExceptionFiles = [
  'packages/agent/src/domain/agent-operation-utils.ts',
  'packages/agent/src/domain/lifecycle-audit.ts',
  'packages/agent/src/domain/lifecycle-operations.ts',
  'packages/agent/src/domain/model-policy-operations.ts',
  'packages/agent/src/domain/state-operations.ts',
];

const agentApplicationImportPatterns = agentLayerImportPatterns('application');
const agentDomainImportPatterns = agentLayerImportPatterns('domain');
const agentLegacyDurableObjectImportPatterns = [
  ...agentLayerImportPatterns('AIAgent'),
  ...['..', '../..', '../../..', '../../../..'].map((prefix) => `${prefix}/AIAgent*`),
];
const agentDurableObjectImportPatterns = [
  ...agentLayerImportPatterns('durable-object'),
  ...agentLegacyDurableObjectImportPatterns,
];
const agentGeneratedRpcImportPatterns = [
  '@cf-tamac/agent-rpc',
  '@cf-tamac/agent-rpc/**',
  '@cf-tamac/client-agent-rpc',
  '@cf-tamac/client-agent-rpc/**',
  ...agentLayerImportPatterns('generated/rpc'),
];
const agentRoutingImportPatterns = agentLayerImportPatterns('agent-routing');
const agentRpcAdapterImportPatterns = agentLayerImportPatterns('rpc/connect-worker-adapter');
const agentRpcImportPatterns = agentLayerImportPatterns('rpc');
const agentRpcInterceptorImportPatterns = agentLayerImportPatterns('rpc/interceptors');
const agentRpcRouterImportPatterns = agentLayerImportPatterns('rpc/router');
const agentRpcServiceImportPatterns = agentLayerImportPatterns('rpc/services');
const agentStorageImportPatterns = agentLayerImportPatterns('storage');
const agentWorkerEntrypointImportPatterns = agentLayerImportPatterns('index', 'worker');

const agentProductionIgnores = [...generatedSourceGlobs, ...packageTestGlobs];

const agentFoundationLayerFiles = [
  'packages/agent/src/application/**/*.{ts,tsx}',
  'packages/agent/src/domain/**/*.{ts,tsx}',
  'packages/agent/src/harness/**/*.{ts,tsx}',
  'packages/agent/src/threads/**/*.{ts,tsx}',
  'packages/agent/src/events/**/*.{ts,tsx}',
  'packages/agent/src/runs/**/*.{ts,tsx}',
  'packages/agent/src/compactions/**/*.{ts,tsx}',
  'packages/agent/src/schedules/**/*.{ts,tsx}',
  'packages/agent/src/tools/**/*.{ts,tsx}',
  'packages/agent/src/integrations/**/*.{ts,tsx}',
  'packages/agent/src/adapters/**/*.{ts,tsx}',
  'packages/agent/src/storage/**/*.{ts,tsx}',
  'packages/agent/src/observability/**/*.{ts,tsx}',
];

const frameworkRuntimeImportPatterns = [
  {
    group: [
      'hono',
      'hono/**',
      '@hono/zod-openapi',
      '@connectrpc/connect',
      '@connectrpc/connect/**',
      'next',
      'next/**',
      'react',
      'react/**',
      'server-only',
      'drizzle-orm',
      'drizzle-orm/**',
      '@cloudflare/**',
      'cloudflare:*',
    ],
    message:
      'Agent foundation lower layers must not import framework, transport, persistence, or platform runtime packages.',
  },
];

const storageFrameworkRuntimeImportPatterns = [
  {
    group: [
      'hono',
      'hono/**',
      '@hono/zod-openapi',
      '@connectrpc/connect',
      '@connectrpc/connect/**',
      'next',
      'next/**',
      'react',
      'react/**',
      'server-only',
      '@cloudflare/**',
      'cloudflare:*',
    ],
    message:
      'Agent storage persistence must not import framework, transport, or platform runtime packages; keep storage imports to persistence seams.',
  },
];

const browserNetworkSyntaxRestrictions = [
  {
    selector: "CallExpression[callee.name='fetch']",
    message:
      'Browser-visible Client modules must not perform direct network calls; use server-only Agent RPC or Server Actions.',
  },
  {
    selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
    message:
      'Browser-visible Client modules must not perform direct network calls; use server-only Agent RPC or Server Actions.',
  },
];

const browserNetworkImportRestrictions = [
  {
    name: 'axios',
    message:
      'Browser-visible Client modules must not add ad-hoc HTTP clients; use server-only Agent RPC or Server Actions.',
  },
  {
    name: 'cross-fetch',
    message:
      'Browser-visible Client modules must not add ad-hoc fetch clients; use server-only Agent RPC or Server Actions.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.next/**',
      '**/.deploy/**',
      '**/next-env.d.ts',
      // OpenCode 配布スキルの実行スクリプトは外部ツールの同梱物であり、
      // 本リポジトリの TypeScript project service や境界ルールでは解析しない。
      '**/.opencode/skills/generate-image/scripts/**',
      '**/.opencode/skills/impeccable/scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...compat.extends('plugin:import/typescript'),
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    plugins: {
      import: importPlugin,
      unicorn: unicorn,
      'eslint-comments': eslintComments,
      boundaries: boundaries,
      security: security,
      sonarjs: sonarjs,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ['./tsconfig.base.json', './packages/*/tsconfig.json'],
        },
      },
      'boundaries/elements': [
        {
          type: 'agent-generated-rpc',
          pattern: 'packages/agent/src/generated/rpc/**/*',
          mode: 'full',
        },
        {
          type: 'client-generated-agent-rpc',
          pattern: 'packages/client/src/generated/agent-rpc/**/*',
          mode: 'full',
        },
        {
          type: 'sdk-generated-agent-rpc',
          pattern: 'packages/sdk/src/generated/agent-rpc/**/*',
          mode: 'full',
        },
        { type: 'agent-runtime', pattern: 'packages/agent/src/**/*', mode: 'full' },
        { type: 'client-runtime', pattern: 'packages/client/src/**/*', mode: 'full' },
        { type: 'client-app', pattern: 'packages/client/app/**/*', mode: 'full' },
        { type: 'sdk-runtime', pattern: 'packages/sdk/src/**/*', mode: 'full' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowString: false, allowNumber: false, allowNullableObject: false },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/disable-enable-pair': 'error',
      'eslint-comments/require-description': ['warn', { ignore: [] }],
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off',
      'import/extensions': [
        'error',
        'ignorePackages',
        { ts: 'never', tsx: 'never', js: 'never', jsx: 'never', mjs: 'never', cjs: 'never' },
      ],
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [{ pattern: '@cf-tamac/**', group: 'internal', position: 'after' }],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],
      'unicorn/better-regex': 'error',
      'unicorn/catch-error-name': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-type-error': 'error',
      'unicorn/throw-new-error': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message:
            'Agent/Client boundary violation: %{from} is not allowed to import from %{target}.',
          rules: [
            { from: ['agent-generated-rpc'], allow: ['agent-generated-rpc'] },
            { from: ['client-generated-agent-rpc'], allow: ['client-generated-agent-rpc'] },
            { from: ['sdk-generated-agent-rpc'], allow: ['sdk-generated-agent-rpc'] },
            { from: ['agent-runtime'], allow: ['agent-runtime', 'agent-generated-rpc'] },
            { from: ['sdk-runtime'], allow: ['sdk-runtime', 'sdk-generated-agent-rpc'] },
            {
              from: ['client-runtime'],
              allow: ['client-runtime', 'client-generated-agent-rpc', 'sdk-runtime'],
            },
            { from: ['client-app'], allow: ['client-app', 'client-runtime'] },
          ],
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
      'sonarjs/cognitive-complexity': ['warn', 30],
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'no-unused-vars': 'off',
    },
  },
  maxlinesConfig,
  {
    files: [
      'packages/agent/src/**/*.{ts,tsx}',
      'packages/client/src/**/*.{ts,tsx}',
      'packages/client/app/**/*.{ts,tsx}',
    ],
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown': 'error',
      'boundaries/no-ignored': 'error',
    },
  },
  {
    files: ['packages/**/src/**/*.{ts,tsx}'],
    ignores: agentProductionIgnores,
    plugins: { 'export-tsdoc': exportTsdocPlugin },
    rules: { 'export-tsdoc/require-export-tsdoc': 'error' },
  },
  {
    files: generatedSourceGlobs,
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'export-tsdoc/require-export-tsdoc': 'off',
      'eslint-comments/no-unused-disable': 'off',
      'eslint-comments/disable-enable-pair': 'off',
      'eslint-comments/require-description': 'off',
    },
  },
  {
    files: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'security/detect-object-injection': 'off',
      'no-restricted-syntax': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'export-tsdoc/require-export-tsdoc': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js', '*.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'import/extensions': 'off',
      'security/detect-object-injection': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/no-duplicate-string': 'off',
    },
  },
  {
    files: ['packages/**/index.ts', 'packages/**/src/**/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Program > :not(ImportDeclaration):not(ExportNamedDeclaration):not(ExportAllDeclaration)',
          message: 'index.ts は実装を持たず、re-export のみにしてください。',
        },
        {
          selector: 'ExportNamedDeclaration[declaration]',
          message: 'index.ts では値や型の直接定義を export せず、re-export のみにしてください。',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'index.ts は re-export のみで default export しないでください。',
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/**/*.{ts,tsx}'],
    ignores: ['packages/agent/src/generated/**/*.{ts,tsx}', '**/*.test.ts', '**/*.spec.ts'],
    rules: { 'no-restricted-imports': ['error', agentNoClientOrRestRule] },
  },
  {
    files: agentFoundationLayerFiles,
    ignores: packageTestGlobs,
    rules: {
      'no-console': 'error',
      'no-restricted-globals': ['error', 'fetch', 'Headers', 'Request', 'Response'],
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            ...frameworkRuntimeImportPatterns,
            {
              group: [
                ...agentRpcImportPatterns,
                ...agentWorkerEntrypointImportPatterns,
                ...agentDurableObjectImportPatterns,
                ...agentRoutingImportPatterns,
                ...agentGeneratedRpcImportPatterns,
              ],
              message:
                'Agent runtime/domain/storage layers must not import Worker, RPC facade, DO routing, or generated descriptor layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/durable-object/**/*.{ts,tsx}'],
    ignores: packageTestGlobs,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            {
              group: [
                ...agentRpcServiceImportPatterns,
                ...agentRpcRouterImportPatterns,
                ...agentRpcInterceptorImportPatterns,
                ...agentWorkerEntrypointImportPatterns,
                ...agentGeneratedRpcImportPatterns,
              ],
              message:
                'Agent durable-object layer must not import RPC services, router, interceptors, Worker entrypoints, or generated descriptor layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/application/**/*.{ts,tsx}'],
    ignores: packageTestGlobs,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            ...frameworkRuntimeImportPatterns,
            {
              group: [
                ...agentRpcImportPatterns,
                ...agentWorkerEntrypointImportPatterns,
                ...agentRoutingImportPatterns,
                ...agentDurableObjectImportPatterns,
                ...agentGeneratedRpcImportPatterns,
              ],
              message:
                'Agent application layer must not import RPC, Worker entrypoints, routing, Durable Object, or generated descriptor layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/domain/**/*.{ts,tsx}'],
    ignores: [...packageTestGlobs, ...agentDomainStorageImportExceptionFiles],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            ...frameworkRuntimeImportPatterns,
            {
              group: [
                ...agentApplicationImportPatterns,
                ...agentDurableObjectImportPatterns,
                ...agentRpcImportPatterns,
                ...agentWorkerEntrypointImportPatterns,
                ...agentRoutingImportPatterns,
                ...agentGeneratedRpcImportPatterns,
                ...agentStorageImportPatterns,
              ],
              message:
                'Agent domain layer must not import application, Durable Object, RPC, Worker, routing, generated descriptor, or storage layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: agentDomainStorageImportExceptionFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            ...frameworkRuntimeImportPatterns,
            {
              group: [
                ...agentApplicationImportPatterns,
                ...agentDurableObjectImportPatterns,
                ...agentRpcImportPatterns,
                ...agentWorkerEntrypointImportPatterns,
                ...agentRoutingImportPatterns,
                ...agentGeneratedRpcImportPatterns,
              ],
              message:
                'Agent domain storage exception files must not import application, Durable Object, RPC, Worker, routing, or generated descriptor layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/storage/**/*.{ts,tsx}'],
    ignores: packageTestGlobs,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            ...storageFrameworkRuntimeImportPatterns,
            {
              group: [
                ...agentDomainImportPatterns,
                ...agentApplicationImportPatterns,
                ...agentDurableObjectImportPatterns,
                '../harness/**',
                '../../harness/**',
                '../threads/**',
                '../../threads/**',
                '../events/**',
                '../../events/**',
                '../runs/**',
                '../../runs/**',
                '../compactions/**',
                '../../compactions/**',
                '../schedules/**',
                '../../schedules/**',
                '../tools/**',
                '../../tools/**',
                '../integrations/**',
                '../../integrations/**',
                '../adapters/**',
                '../../adapters/**',
                ...agentRoutingImportPatterns,
              ],
              message:
                'Agent storage layer must not import Agent domain, application, Durable Object, runtime, or routing layers.',
            },
            {
              group: [
                ...agentRpcImportPatterns,
                ...agentWorkerEntrypointImportPatterns,
                ...agentGeneratedRpcImportPatterns,
              ],
              message:
                'Agent storage must not import Worker, RPC facade, or generated descriptor layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/rpc/services/**/*.{ts,tsx}'],
    ignores: packageTestGlobs,
    rules: {
      'sonarjs/cognitive-complexity': ['error', 10],
      complexity: ['error', { max: 10 }],
      'max-depth': ['error', 3],
      'no-restricted-globals': ['error', 'fetch', 'Headers', 'Request', 'Response'],
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            {
              group: [
                ...agentRpcRouterImportPatterns,
                ...agentRpcAdapterImportPatterns,
                ...agentRpcInterceptorImportPatterns,
              ],
              message:
                'Agent RPC service modules must not import router, adapter, or interceptor layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/rpc/dispatch/**/*.{ts,tsx}'],
    ignores: packageTestGlobs,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            {
              group: agentWorkerEntrypointImportPatterns,
              message: 'Agent RPC dispatch modules must not import Worker entrypoints.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/agent/src/rpc/mappers/**/*.{ts,tsx}'],
    ignores: packageTestGlobs,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...agentNoClientOrRestRule,
          patterns: [
            ...agentNoClientOrRestRule.patterns,
            {
              group: [
                ...agentDurableObjectImportPatterns,
                ...agentRoutingImportPatterns,
                ...agentWorkerEntrypointImportPatterns,
              ],
              message:
                'Agent RPC mapper modules must not import Durable Object, routing, or Worker entrypoint layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    ignores: ['packages/client/src/generated/**/*.{ts,tsx}', ...packageTestGlobs],
    rules: { 'no-restricted-imports': ['error', { patterns: clientNoAgentRuntimePatterns }] },
  },
  {
    files: ['packages/client/app/**/*.{ts,tsx}', 'packages/client/src/**/*.{ts,tsx}'],
    ignores: [
      'packages/client/src/server/**/*.{ts,tsx}',
      'packages/client/src/generated/**/*.{ts,tsx}',
      ...packageTestGlobs,
    ],
    rules: {
      'no-restricted-syntax': ['error', ...browserNetworkSyntaxRestrictions],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...browserNetworkImportRestrictions,
            {
              name: 'server-only',
              message:
                'Browser-visible Client modules must not import server-only Agent RPC or credential seams.',
            },
          ],
          patterns: [
            ...clientNoAgentRuntimePatterns,
            {
              group: [
                'packages/client/src/server/**',
                '../src/server/**',
                '../../src/server/**',
                '../server/**',
                '../../server/**',
                '@cf-tamac/client-agent-rpc/**',
                '@cf-tamac/sdk',
                '@cf-tamac/sdk/**',
                '@cf-tamac/sdk-agent-rpc',
                '@cf-tamac/sdk-agent-rpc/**',
                '@connectrpc/connect',
                '@connectrpc/connect/**',
                '**/sdk',
                '**/packages/sdk/**',
                '**/sdk/**',
              ],
              message:
                'Browser-visible Client modules must not import server-only SDK/JWT signing, Agent RPC credentials, generated Agent RPC, or Connect runtime.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/client/app/api/**/*.{ts,tsx}',
      'packages/client/src/**/api/**/*.{ts,tsx}',
      'packages/client/src/**/*proxy*.{ts,tsx}',
    ],
    ignores: packageTestGlobs,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Client Worker は Agent API proxy、/api/client/*、/api/agent*、arbitrary RPC forwarding route を公開しないでください。',
        },
      ],
    },
  }
);
