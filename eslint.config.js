import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import boundaries from 'eslint-plugin-boundaries';
import eslintComments from 'eslint-plugin-eslint-comments';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
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
        docs: {
          description: 'Require TSDoc comments for exported declarations.',
        },
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
          if (comments.length === 0) {
            return false;
          }
          const last = comments[comments.length - 1];
          const isAdjacent = node.loc.start.line - last.loc.end.line <= 1;
          const isTsdoc = last.type === 'Block' && last.value.startsWith('*');
          return isAdjacent && isTsdoc;
        };

        const hasTsdocComment = (node) => {
          if (isTsdocCommentBefore(node)) {
            return true;
          }
          const parent = node.parent;
          if (
            parent &&
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
          if (!decl) return null;
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
          if (!decl) return null;
          const target = decl.type === 'Identifier' ? node : decl;
          return { target, label: 'default export' };
        };

        return {
          ExportNamedDeclaration(node) {
            const info = getExportInfo(node);
            if (!info) return;
            reportIfMissing(info.target, info.label);
          },
          ExportDefaultDeclaration(node) {
            const info = getDefaultExportInfo(node);
            if (!info) return;
            reportIfMissing(info.target, info.label);
          },
        };
      },
    },
  },
};

export default tseslint.config(
  // 除外対象
  {
    ignores: ['**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
  },

  // ベース設定
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...compat.extends('plugin:import/typescript'),

  // 全体設定
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // グローバルルール設定
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
          project: ['./tsconfig.base.json', './packages/*/*/tsconfig.json'],
        },
      },
      'boundaries/elements': [
        {
          type: 'typespec-openapi',
          pattern: 'packages/typespec/openapi/openapi.json',
          mode: 'full',
        },
        { type: 'backend-entry', pattern: 'packages/backend/entry/src/index.ts', mode: 'full' },
        { type: 'backend-app', pattern: 'packages/backend/app/src/**/*', mode: 'full' },
        { type: 'backend-http', pattern: 'packages/backend/http/src/**/*', mode: 'full' },
        {
          type: 'backend-persistence',
          pattern: 'packages/backend/persistence/src/**/*',
          mode: 'full',
        },
        { type: 'backend-domain', pattern: 'packages/backend/domain/src/**/*', mode: 'full' },
        { type: 'backend-usecases', pattern: 'packages/backend/usecases/src/**/*', mode: 'full' },
        { type: 'backend-types', pattern: 'packages/backend/types/src/**/*', mode: 'full' },
        { type: 'frontend-api', pattern: 'packages/frontend/api/src/**/*', mode: 'full' },
        { type: 'frontend-domain', pattern: 'packages/frontend/domain/src/**/*', mode: 'full' },
        { type: 'frontend-app', pattern: 'packages/frontend/app/src/**/*', mode: 'full' },
        { type: 'ui', pattern: 'packages/frontend/ui/src/**/*', mode: 'full' },
        { type: 'drizzle', pattern: 'packages/backend/drizzle/src/**/*', mode: 'full' },
      ],
    },
    rules: {
      // ===== TypeScript 厳格化 =====
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
        },
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
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      // ===== ESLint 無効化コメントの制限 =====
      'eslint-comments/no-unused-disable': 'error',
      'eslint-comments/disable-enable-pair': 'error',
      'eslint-comments/require-description': [
        'warn',
        {
          ignore: [],
        },
      ],
      // 完全禁止する場合は以下を有効化
      // 'eslint-comments/no-use': 'error',

      // ===== Import/Export =====
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off', // TypeScript が解決するのでオフ
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          tsx: 'never',
          js: 'never',
          jsx: 'never',
        },
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
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: '@cfreact-template-backend/drizzle',
              group: 'internal',
              position: 'after',
            },
            {
              pattern: '@cfreact-template-frontend/**',
              group: 'internal',
              position: 'after',
            },
            {
              pattern: '@cfreact-template-frontend/ui/**',
              group: 'internal',
              position: 'after',
            },
            {
              pattern: '@cfreact-template-backend/**',
              group: 'internal',
              position: 'after',
            },
            {
              pattern: '@ui/**',
              group: 'internal',
              position: 'after',
            },
            {
              pattern: '@drizzle/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
        },
      ],

      // ===== Unicorn (厳選) =====
      'unicorn/better-regex': 'error',
      'unicorn/catch-error-name': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-type-error': 'error',
      'unicorn/throw-new-error': 'error',

      // ===== Clean Architecture boundaries =====
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: 'Clean Architecture violation: %{from} is not allowed to import from %{target}.',
          rules: [
            {
              from: ['backend-domain'],
              allow: ['backend-domain', 'backend-types'],
            },
            {
              from: ['backend-types'],
              allow: ['backend-types'],
            },
            {
              from: ['backend-usecases'],
              allow: ['backend-domain', 'backend-usecases', 'backend-types'],
            },
            {
              from: ['backend-persistence'],
              allow: [
                'backend-usecases',
                'backend-domain',
                'backend-types',
                'backend-persistence',
                'drizzle',
              ],
            },
            {
              from: ['backend-http'],
              allow: [
                'backend-http',
                'backend-usecases',
                'backend-domain',
                'backend-types',
                'typespec-openapi',
              ],
            },
            {
              from: ['backend-app'],
              allow: [
                'backend-app',
                'backend-http',
                'backend-persistence',
                'backend-usecases',
                'backend-domain',
                'backend-types',
              ],
            },
            {
              from: ['backend-entry'],
              allow: ['backend-app'],
            },
            {
              from: ['frontend-api'],
              allow: ['frontend-api'],
            },
            {
              from: ['frontend-domain'],
              allow: ['frontend-domain', 'frontend-api'],
            },
            {
              from: ['frontend-app'],
              allow: ['frontend-app', 'frontend-domain', 'ui'],
            },
            {
              from: ['ui'],
              allow: ['ui'],
            },
            {
              from: ['drizzle'],
              allow: ['drizzle'],
            },
          ],
        },
      ],

      // Domain / UseCase は外部ライブラリに依存しない
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['backend-domain', 'backend-usecases'],
              disallow: ['*'],
            },
          ],
        },
      ],

      // ===== セキュリティ =====
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-possible-timing-attacks': 'warn',

      // ===== Sonar (コードスメル) =====
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-duplicate-string': [
        'warn',
        {
          threshold: 5,
        },
      ],
      'sonarjs/cognitive-complexity': ['warn', 30],

      // ===== コード品質 =====
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'no-unused-vars': 'off', // TypeScript が処理
      // ファイル/関数の肥大化防止
    },
  },

  // Boundaries: 層定義外のファイルや依存を禁止
  {
    files: [
      'packages/backend/**/src/**/*.{ts,tsx}',
      'packages/frontend/**/src/**/*.{ts,tsx}',
      'packages/frontend/ui/src/**/*.{ts,tsx}',
      'packages/backend/drizzle/src/**/*.{ts,tsx}',
    ],
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown': 'error',
      'boundaries/no-ignored': 'error',
    },
  },

  // エクスポートは TSDoc 必須（再エクスポートは対象外）
  {
    files: ['packages/**/src/**/*.{ts,tsx}'],
    ignores: [
      'packages/frontend/api/src/generated/**/*.{ts,tsx}',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    plugins: {
      'export-tsdoc': exportTsdocPlugin,
    },
    rules: {
      'export-tsdoc/require-export-tsdoc': 'error',
    },
  },

  // packages 配下は import で拡張子 .js を禁止
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/frontend/api/src/generated/**/*.{ts,tsx}'],
    rules: {
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          ts: 'never',
          tsx: 'never',
          js: 'never',
          jsx: 'never',
          mjs: 'never',
          cjs: 'never',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: ['*.js', '*.mjs', '*.cjs', '**/*.js', '**/*.mjs', '**/*.cjs'],
        },
      ],
    },
  },
  // TS/TSX の長さ制約（別ファイルの JSON から読み込み）
  maxlinesConfig,

  // テストファイルは長さ制約を除外
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },

  // App 層から API パッケージを直接参照しない
  {
    files: ['packages/frontend/app/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@cfreact-template-frontend/api',
              message:
                'App 層では API パッケージを直接 import せず、domain hooks を経由してください。',
            },
          ],
          patterns: [
            {
              group: ['@cfreact-template-frontend/api/**'],
              message:
                'App 層では API パッケージを直接 import せず、domain hooks を経由してください。',
            },
          ],
        },
      ],
    },
  },

  // packages 配下の index.ts は re-export 専用（実装禁止）
  {
    files: ['packages/**/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Program > :not(ImportDeclaration):not(ExportNamedDeclaration):not(ExportAllDeclaration)',
          message: 'index.ts では実装を持たず、re-export のみにしてください。',
        },
        {
          selector: 'ExportNamedDeclaration[declaration]',
          message: 'index.ts では値や関数の実装を直接 export しないでください (re-export のみ)。',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'index.ts での default export は禁止です。re-export のみにしてください。',
        },
      ],
    },
  },

  // API SDK (生成コード) は厳格ルールを緩和
  {
    files: ['packages/frontend/api/src/generated/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './packages/frontend/api/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-misused-spread': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },

  // React クライアント側の設定
  {
    files: ['packages/frontend/**/*.{ts,tsx}', 'packages/frontend/ui/**/*.{ts,tsx}'],
    plugins: {
      react: react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      '@tanstack/query': tanstackQuery,
    },
    settings: {
      react: {
        version: '19.0.0',
      },
    },
    rules: {
      // ===== React =====
      'react/jsx-key': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-children-prop': 'error',
      'react/no-danger': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-boolean-value': ['error', 'never'],
      'react/jsx-curly-brace-presence': [
        'error',
        {
          props: 'never',
          children: 'never',
        },
      ],

      // ===== React Hooks =====
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // ===== React Refresh (Vite HMR) =====
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
        },
      ],

      // ===== TanStack Query =====
      '@tanstack/query/exhaustive-deps': 'error',
      '@tanstack/query/no-rest-destructuring': 'warn',
      '@tanstack/query/stable-query-client': 'error',

      // ===== Accessibility (a11y) =====
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
    },
  },

  // React Hooks 用の命名規約
  {
    files: ['packages/frontend/domain/src/hooks/**/*.{ts,tsx}'],
    plugins: {
      'hooks-domain': {
        rules: {
          'require-domain-structure': {
            meta: {
              type: 'problem',
              docs: {
                description:
                  'Ensure hooks return both data/actions objects with Data/Actions types',
              },
              schema: [],
            },
            create(context) {
              const hookStack = [];
              const startHook = (node, typeInfo) => {
                hookStack.push({
                  node,
                  hasDomainResult: false,
                  hasType: typeInfo?.hasType ?? false,
                  typeIsValid: typeInfo?.typeIsValid ?? false,
                });
              };
              const endHook = (node) => {
                const info = hookStack.pop();
                if (!info) {
                  return;
                }
                if (!info.hasDomainResult) {
                  context.report({
                    node,
                    message:
                      'ドメイン概念の抽象化が不適切です。hooks は data/actions をまとめて返してください (ドメイン状態と操作の両方)。',
                  });
                }
                if (!info.hasType) {
                  context.report({
                    node,
                    message:
                      'ドメイン概念の抽象化が不適切です。hooks は戻り値に data/actions を含む型注釈（*Data / *Actions）を付けてください。',
                  });
                } else if (!info.typeIsValid) {
                  context.report({
                    node,
                    message:
                      'data の型は *Data、actions の型は *Actions で注釈してください（例: { data: FooData; actions: FooActions }）。',
                  });
                }
              };
              const currentHook = () => hookStack[hookStack.length - 1];

              const checkReturn = (arg) => {
                if (!arg) return false;
                if (arg.type === 'ObjectExpression') {
                  const hasData = arg.properties.some(
                    (prop) =>
                      prop.type === 'Property' &&
                      prop.key.type === 'Identifier' &&
                      prop.key.name === 'data'
                  );
                  const hasActions = arg.properties.some(
                    (prop) =>
                      prop.type === 'Property' &&
                      prop.key.type === 'Identifier' &&
                      prop.key.name === 'actions'
                  );
                  return hasData && hasActions;
                }
                return false;
              };

              const isHookName = (name) => /^use[\dA-Z].*/.test(name ?? '');

              const typeEndsWith = (typeName, suffix) =>
                typeof typeName === 'string' && typeName.endsWith(suffix);

              const getIdentifierName = (typeRef) => {
                if (typeRef.type === 'Identifier') return typeRef.name;
                if (typeRef.type === 'TSQualifiedName' && typeRef.right.type === 'Identifier') {
                  return typeRef.right.name;
                }
                return null;
              };

              const evaluateTypeLiteral = (typeNode) => {
                if (!typeNode || typeNode.type !== 'TSTypeLiteral') {
                  return { hasType: true, typeIsValid: false };
                }
                let dataOk = false;
                let actionsOk = false;
                for (const member of typeNode.members) {
                  if (
                    member.type === 'TSPropertySignature' &&
                    member.key.type === 'Identifier' &&
                    member.typeAnnotation
                  ) {
                    const name = member.key.name;
                    const typeAnn = member.typeAnnotation.typeAnnotation;
                    if (
                      name === 'data' &&
                      typeAnn.type === 'TSTypeReference' &&
                      typeEndsWith(getIdentifierName(typeAnn.typeName) ?? '', 'Data')
                    ) {
                      dataOk = true;
                    }
                    if (
                      name === 'actions' &&
                      typeAnn.type === 'TSTypeReference' &&
                      typeEndsWith(getIdentifierName(typeAnn.typeName) ?? '', 'Actions')
                    ) {
                      actionsOk = true;
                    }
                  }
                }
                return { hasType: true, typeIsValid: dataOk && actionsOk };
              };

              const evaluateTypeAnnotation = (tsAnnotation) => {
                if (!tsAnnotation) return { hasType: false, typeIsValid: false };
                const t =
                  tsAnnotation.type === 'TSTypeAnnotation'
                    ? tsAnnotation.typeAnnotation
                    : tsAnnotation;
                if (!t) return { hasType: false, typeIsValid: false };
                if (t.type === 'TSTypeLiteral') {
                  return evaluateTypeLiteral(t);
                }
                // Other shapes (type aliases etc.) are treated as present but not validated
                return { hasType: true, typeIsValid: false };
              };

              return {
                FunctionDeclaration(node) {
                  if (node.id && isHookName(node.id.name)) {
                    const typeInfo = evaluateTypeAnnotation(node.returnType);
                    startHook(node, typeInfo);
                  }
                },
                'FunctionDeclaration:exit'(node) {
                  if (node.id && isHookName(node.id.name)) {
                    endHook(node);
                  }
                },

                VariableDeclarator(node) {
                  if (
                    node.id.type === 'Identifier' &&
                    isHookName(node.id.name) &&
                    (node.init?.type === 'ArrowFunctionExpression' ||
                      node.init?.type === 'FunctionExpression')
                  ) {
                    const typeInfo =
                      evaluateTypeAnnotation(node.id.typeAnnotation) ||
                      evaluateTypeAnnotation(node.init.returnType);
                    startHook(node, typeInfo);
                    const body = node.init.body;
                    if (body && body.type !== 'BlockStatement' && checkReturn(body)) {
                      const info = currentHook();
                      if (info) info.hasDomainResult = true;
                    }
                  }
                },
                'VariableDeclarator:exit'(node) {
                  if (node.id.type === 'Identifier' && isHookName(node.id.name)) {
                    endHook(node);
                  }
                },

                ReturnStatement(node) {
                  const info = currentHook();
                  if (!info) return;
                  if (checkReturn(node.argument)) {
                    info.hasDomainResult = true;
                  }
                },
              };
            },
          },
        },
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name!=/^(use[A-Z0-9].*)/]',
          message:
            'hooks ディレクトリでは値のエクスポートは use で始まるカスタムフックに限定してください。',
        },
        {
          selector:
            "ExportNamedDeclaration[exportKind!='type'] > FunctionDeclaration[id.name!=/^(use[A-Z0-9].*)/]",
          message:
            'hooks ディレクトリでは値のエクスポートは use で始まるカスタムフックに限定してください。',
        },
        {
          selector:
            "ExportNamedDeclaration[exportKind!='type'] > ExportSpecifier[exported.name!=/^(use[A-Z0-9].*)/]",
          message:
            'hooks ディレクトリから再エクスポートできる値は use で始まるカスタムフックのみです。',
        },
        {
          selector: 'ExportDefaultDeclaration > Identifier[name!=/^(use[A-Z0-9].*)/]',
          message:
            'hooks ディレクトリではデフォルトエクスポートも use で始まるカスタムフックにしてください。',
        },
        {
          selector: 'ExportDefaultDeclaration > FunctionDeclaration[id.name!=/^(use[A-Z0-9].*)/]',
          message:
            'hooks ディレクトリではデフォルトエクスポートも use で始まるカスタムフックにしてください。',
        },
        {
          selector:
            'FunctionDeclaration[id.name=/^use/]:not(:has(CallExpression[callee.name=/^(use|useQuery|useMutation|useQueryClient|useState|useEffect|useMemo|useCallback|useRef)/]))',
          message:
            'use* は少なくとも1つは React/TanStack の hook を使って状態・副作用・キャッシュを扱ってください。',
        },
        {
          selector: "ReturnStatement:has(Identifier[name='apiClient'])",
          message:
            'apiClient をそのまま返す/ラップするのは禁止です。hooks 内でドメインロジック・状態をまとめて返してください。',
        },
        {
          selector: "ExportSpecifier[exported.name='apiClient'], Identifier[name='apiClient']",
          message: 'apiClient の再エクスポートを禁止します。',
        },
        {
          selector:
            "ImportSpecifier[importKind='type']:not([parent.source.value='types']):not([parent.source.value^='types/'])",
          message:
            'hooks の型 import は src/types 経由にしてください (import type ... from "types")。',
        },
        {
          selector:
            "ImportDeclaration[importKind='type']:not([source.value='types']):not([source.value^='types/'])",
          message:
            'hooks の型 import は src/types 経由にしてください (import type ... from "types")。',
        },
      ],
      'hooks-domain/require-domain-structure': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@cfreact-template-frontend/app/**', '../app/**'],
              message: 'hooks では UI 層（app/pages/components）の import を禁止します。',
            },
          ],
        },
      ],
      'unicorn/filename-case': [
        'error',
        {
          case: 'camelCase',
        },
      ],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message: 'Clean Architecture violation: %{from} is not allowed to import from %{target}.',
          rules: [
            {
              from: ['frontend-domain'],
              allow: ['frontend-domain', 'frontend-api'],
            },
          ],
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'function',
          format: ['PascalCase'],
          prefix: ['use'],
        },
        {
          selector: 'variable',
          modifiers: ['const'],
          types: ['function'],
          format: ['PascalCase'],
          prefix: ['use'],
        },
      ],
    },
  },

  // client 全体で直接 fetch しない（共通 API 経由）
  {
    files: [
      'packages/frontend/app/src/**/*.{ts,tsx}',
      'packages/frontend/domain/src/**/*.{ts,tsx}',
    ],
    ignores: [
      'packages/frontend/app/src/**/*.test.ts',
      'packages/frontend/app/src/**/*.test.tsx',
      'packages/frontend/app/src/**/*.spec.ts',
      'packages/frontend/app/src/**/*.spec.tsx',
      'packages/frontend/domain/src/**/*.test.ts',
      'packages/frontend/domain/src/**/*.test.tsx',
      'packages/frontend/domain/src/**/*.spec.ts',
      'packages/frontend/domain/src/**/*.spec.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'Pages, components, and hooks must call the shared apiClient instead of fetch directly.',
        },
        {
          selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
          message:
            'Pages, components, and hooks must call the shared apiClient instead of fetch directly.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Use @cfreact-template-frontend/api instead of axios.',
            },
            {
              name: 'cross-fetch',
              message: 'Use @cfreact-template-frontend/api instead of performing manual fetches.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/frontend/app/src/pages/**/*.{ts,tsx}'],
    ignores: [
      'packages/frontend/app/src/**/*.test.ts',
      'packages/frontend/app/src/**/*.test.tsx',
      'packages/frontend/app/src/**/*.spec.ts',
      'packages/frontend/app/src/**/*.spec.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'Pages must call the shared apiClient instead of fetch directly.',
        },
        {
          selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
          message: 'Pages must call the shared apiClient instead of fetch directly.',
        },
        {
          selector: 'CallExpression[callee.name=/^(useMemo|useCallback)$/]',
          message:
            'Pages 層での useMemo/useCallback は components 層または hooks 層にロジックを移して使用してください。',
        },
        {
          selector:
            'CallExpression[callee.name=/^(useReducer|useEffect|useLayoutEffect|useInsertionEffect|useRef|useImperativeHandle|useTransition|useDeferredValue|useId|useSyncExternalStore|useOptimistic|useActionState)$/]',
          message:
            'Pages 層では useState 以外の React の組み込み Hooks を直接使わず hooks 層に委譲してください。',
        },
        {
          selector:
            "CallExpression[callee.object.name='React'][callee.property.name=/^(useMemo|useCallback)$/]",
          message:
            'Pages 層での useMemo/useCallback は components 層または hooks 層にロジックを移して使用してください。',
        },
        {
          selector:
            "CallExpression[callee.object.name='React'][callee.property.name=/^(useReducer|useEffect|useLayoutEffect|useInsertionEffect|useRef|useImperativeHandle|useTransition|useDeferredValue|useId|useSyncExternalStore|useOptimistic|useActionState)$/]",
          message:
            'Pages 層では useState 以外の React の組み込み Hooks を直接使わず hooks 層に委譲してください。',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Use @cfreact-template-frontend/api instead of axios.',
            },
            {
              name: 'cross-fetch',
              message: 'Use @cfreact-template-frontend/api instead of performing manual fetches.',
            },
            {
              name: 'react',
              importNames: ['useMemo', 'useCallback'],
              message:
                'Pages 層での useMemo/useCallback は components 層または hooks 層にロジックを移して使用してください。',
            },
            {
              name: 'react',
              importNames: [
                'useReducer',
                'useEffect',
                'useLayoutEffect',
                'useInsertionEffect',
                'useRef',
                'useImperativeHandle',
                'useTransition',
                'useDeferredValue',
                'useId',
                'useSyncExternalStore',
                'useOptimistic',
                'useActionState',
              ],
              message:
                'Pages 層では useState 以外の React の組み込み Hooks を直接使わず hooks 層に委譲してください。',
            },
          ],
          patterns: [
            {
              group: ['@cfreact-template-frontend/api/**'],
              message: 'App 層から API パッケージを直接 import しないでください（domain 経由）。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/frontend/app/src/components/**/*.{ts,tsx}'],
    ignores: [
      'packages/frontend/app/src/components/**/*.test.ts',
      'packages/frontend/app/src/components/**/*.test.tsx',
      'packages/frontend/app/src/components/**/*.spec.ts',
      'packages/frontend/app/src/components/**/*.spec.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='useState']",
          message:
            'Components 層では状態管理に useState を使わず hooks 層または pages 層の useState に委譲してください。',
        },
        {
          selector: "CallExpression[callee.object.name='React'][callee.property.name='useState']",
          message:
            'Components 層では状態管理に useState を使わず hooks 層または pages 層の useState に委譲してください。',
        },
        {
          selector:
            'CallExpression[callee.name=/^(useReducer|useEffect|useLayoutEffect|useInsertionEffect|useRef|useImperativeHandle|useTransition|useDeferredValue|useId|useSyncExternalStore|useOptimistic|useActionState)$/]',
          message:
            'Components 層では React の組み込み Hooks は useMemo/useCallback のみに限定し、その他は hooks 層に委譲してください。',
        },
        {
          selector:
            "CallExpression[callee.object.name='React'][callee.property.name=/^(useReducer|useEffect|useLayoutEffect|useInsertionEffect|useRef|useImperativeHandle|useTransition|useDeferredValue|useId|useSyncExternalStore|useOptimistic|useActionState)$/]",
          message:
            'Components 層では React の組み込み Hooks は useMemo/useCallback のみに限定し、その他は hooks 層に委譲してください。',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              importNames: ['useState'],
              message:
                'Components 層では状態管理に useState を使わず hooks 層または pages 層の useState に委譲してください。',
            },
            {
              name: 'react',
              importNames: [
                'useReducer',
                'useEffect',
                'useLayoutEffect',
                'useInsertionEffect',
                'useRef',
                'useImperativeHandle',
                'useTransition',
                'useDeferredValue',
                'useId',
                'useSyncExternalStore',
                'useOptimistic',
                'useActionState',
              ],
              message:
                'Components 層では React の組み込み Hooks は useMemo/useCallback のみに限定し、その他は hooks 層に委譲してください。',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/frontend/app/src/pages/**/*.{ts,tsx}',
      'packages/frontend/app/src/components/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@cfreact-template-frontend/api',
              message: 'Pages/Components は Hooks 経由でAPIを呼び出してください。',
            },
            {
              name: '@cfreact-template-frontend/domain',
              message: 'hooks は個別フックを指し示すパスで import してください。',
            },
          ],
          patterns: [
            {
              group: ['@cfreact-template-frontend/app/src/components/**'],
              message: 'components 同士の循環参照を避け、必要なら hooks 経由にしてください。',
            },
          ],
        },
      ],
    },
  },
  // Pages 直下の TSX ファイルを禁止
  {
    files: ['packages/frontend/app/src/pages/*.tsx'],
    ignores: [
      'packages/frontend/app/src/pages/*.test.tsx',
      'packages/frontend/app/src/pages/*.spec.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'pages 直下に TSX を直接配置しないでください。サブディレクトリを作成して配置してください。',
        },
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'Pages, components, and hooks must call the shared apiClient instead of fetch directly.',
        },
        {
          selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
          message:
            'Pages, components, and hooks must call the shared apiClient instead of fetch directly.',
        },
      ],
    },
  },

  // サーバー側（Hono）の設定
  {
    files: ['packages/backend/**/*.ts'],
    rules: {
      // サーバー側では console.log を許可（ログ出力として使用）
      'no-console': 'off',
    },
  },
  {
    files: ['packages/backend/**/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**'],
              message:
                '@cfreact-template-backend/* エイリアスでパッケージ内の上位ディレクトリを参照してください。',
            },
            {
              group: ['@cfreact-template-backend/app/**'],
              message: 'App層の依存はappパッケージ内でのみ利用してください。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/backend/app/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**'],
              message:
                '@cfreact-template-backend/* エイリアスでパッケージ内の上位ディレクトリを参照してください。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/backend/domain/src/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
      'no-restricted-globals': ['error', 'fetch', 'Headers', 'Request', 'Response'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@cfreact-template-backend/http/**',
                '@cfreact-template-backend/persistence/**',
                '../http/**',
                '../persistence/**',
              ],
              message: 'Domain層からAdaptersを参照しないでください。',
            },
            {
              group: [
                'hono',
                'hono/**',
                'drizzle-orm',
                'drizzle-orm/**',
                '@cloudflare/**',
                'cloudflare:*',
                'zod',
                '@hono/zod-openapi',
              ],
              message: 'Domain層ではフレームワークやインフラ依存を禁止します。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/backend/usecases/src/**/*.{ts,tsx}'],
    rules: {
      // UseCase は配線/手順に寄せて、複雑化を Domain 側へ押し戻す
      'sonarjs/cognitive-complexity': ['error', 10],
      complexity: ['error', { max: 10 }],
      'max-depth': ['error', 3],

      'no-console': 'error',
      'no-restricted-globals': ['error', 'fetch', 'Headers', 'Request', 'Response'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@cfreact-template-backend/http/**',
                '@cfreact-template-backend/persistence/**',
                '../http/**',
                '../persistence/**',
              ],
              message: 'UseCase層からAdaptersを参照しないでください。',
            },
            {
              group: [
                'hono',
                'hono/**',
                'drizzle-orm',
                'drizzle-orm/**',
                '@cloudflare/**',
                'cloudflare:*',
                'zod',
                '@hono/zod-openapi',
              ],
              message: 'UseCase層ではフレームワークやインフラ依存を禁止します。',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "ThrowStatement > NewExpression[callee.name='Error']",
          message:
            'UseCase層での throw new Error は禁止です。Domain で定義したエラー型を使用してください。',
        },
        {
          selector:
            'TSInterfaceDeclaration[id.name=/.*(Repository|Port|Gateway|Notifier)$/], TSTypeAliasDeclaration[id.name=/.*(Repository|Port|Gateway|Notifier)$/]',
          message:
            'UseCase層で Port/Repository などのインターフェースを定義しないでください。Domain層に定義してください。',
        },
        {
          selector: "ClassDeclaration[superClass.type='Identifier'][superClass.name=/Error$/]",
          message:
            'UseCase層で Error 派生クラスを定義しないでください。Domain層で定義してください。',
        },
        {
          selector:
            "TSInterfaceDeclaration[id.name='AppVariables'], TSTypeAliasDeclaration[id.name='AppVariables']",
          message:
            'AppVariables は UseCase 層に定義しないでください。HTTPアダプタ層で管理してください。',
        },
      ],
    },
  },
  {
    files: ['packages/backend/app/src/server.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='set'][arguments.0.value='kv']",
          message:
            'server.ts で kv を Context へ直接注入しないでください。必要なら app で組み立てた依存を UseCase 経由で渡してください。',
        },
        {
          selector: "CallExpression[callee.property.name='set'][arguments.0.value='r2']",
          message:
            'server.ts で r2 を Context へ直接注入しないでください。必要なら app で組み立てた依存を UseCase 経由で渡してください。',
        },
      ],
    },
  },
  {
    files: ['packages/backend/http/src/context.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSPropertySignature[key.name='kv'], TSPropertySignature[key.name='r2']",
          message:
            'AppVariables に KV/R2 の生バインディングを追加しないでください。UseCase 経由の依存だけを公開してください。',
        },
      ],
    },
  },
  {
    files: ['packages/frontend/ui/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**'],
              message: '@ui エイリアスでパッケージ内の上位ディレクトリを参照してください。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/backend/drizzle/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**'],
              message: '@drizzle エイリアスでパッケージ内の上位ディレクトリを参照してください。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['packages/backend/http/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@cfreact-template-backend/app',
              message:
                'HTTPアダプタ層から App 層を参照しないでください。必要な型は usecases/types から参照してください。',
            },
            {
              name: 'zod',
              message: 'zod は packages/backend/http/src/schemas 配下でのみ使用してください。',
            },
            {
              name: '@hono/zod-openapi',
              importNames: ['OpenAPIHono', 'createRoute'],
              message: 'createRoute / OpenAPIHono は routes 以外で import しないでください。',
            },
          ],
          patterns: [
            {
              group: ['../**'],
              message:
                '@cfreact-template-backend/* エイリアスでパッケージ内の上位ディレクトリを参照してください。',
            },
            {
              group: [
                '../persistence/**',
                '../../persistence/**',
                '@cfreact-template-backend/persistence/**',
              ],
              message:
                'HTTPアダプタ層から直接Persistence層を参照せず、UseCase経由でアクセスしてください。',
            },
            {
              group: ['@cfreact-template-backend/app/**'],
              message:
                'HTTPアダプタ層から App 層を参照しないでください。必要な型は usecases/types から参照してください。',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='c'][property.name='env']",
          message: 'HTTP層から直接c.envを参照せず、appレイヤが注入する依存を利用してください。',
        },
        {
          selector:
            'TSInterfaceDeclaration[id.name=/.*(Repository|Port|Gateway|Notifier)$/], TSTypeAliasDeclaration[id.name=/.*(Repository|Port|Gateway|Notifier)$/]',
          message:
            'HTTP層で Port/Repository などのインターフェースを定義しないでください。Domain層に定義してください。',
        },
        {
          selector: "ClassDeclaration[superClass.type='Identifier'][superClass.name=/Error$/]",
          message: 'HTTP層で Error 派生クラスを定義しないでください。Domain層で定義してください。',
        },
      ],
    },
  },
  {
    files: ['packages/backend/http/src/**/*.test.ts', 'packages/backend/http/src/**/*.test.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['packages/backend/http/src/schemas/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@hono/zod-openapi',
              importNames: ['OpenAPIHono', 'createRoute'],
              message: 'createRoute / OpenAPIHono は routes 以外で import しないでください。',
            },
          ],
          patterns: [
            {
              group: [
                '../persistence/**',
                '../../persistence/**',
                '@cfreact-template-backend/persistence/**',
              ],
              message:
                'HTTPアダプタ層から直接Persistence層を参照せず、UseCase経由でアクセスしてください。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/backend/http/src/routes/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'hono',
              message: 'OpenAPI ルートでは @hono/zod-openapi を使用してください。',
            },
            {
              name: 'zod',
              message: 'zod は packages/backend/http/src/schemas 配下でのみ使用してください。',
            },
          ],
          patterns: [
            {
              group: [
                '../persistence/**',
                '../../persistence/**',
                '@cfreact-template-backend/persistence/**',
              ],
              message:
                'HTTPアダプタ層から直接Persistence層を参照せず、UseCase経由でアクセスしてください。',
            },
          ],
        },
      ],
    },
  },

  // ESLint 設定ファイルやテストのゆるめ設定
  {
    files: ['eslint.config.js'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['packages/frontend/app/src/tests/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  // packages 全体で index.ts 経由の import を強制 + 行数制約（生成コード・テストは除外）
  {
    files: ['packages/**/src/**/*.{ts,tsx}'],
    ignores: [
      '**/index.ts',
      'packages/frontend/api/src/generated/**/*.{ts,tsx}',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    rules: {
      'max-lines': [
        'error',
        {
          max: 500,
          skipComments: true,
          skipBlankLines: true,
        },
      ],
      'max-lines-per-function': [
        'error',
        {
          max: 100,
          skipComments: true,
          skipBlankLines: true,
          IIFEs: true,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/src/**/!(*index)',
                '@cfreact-template-frontend/**/!(*index)',
                '@cfreact-template-backend/**/!(*index)',
                '@cfreact-template/**/!(*index)',
                './**/!(*index)',
                '../**/!(*index)',
              ],
              message: 'import は各ディレクトリの index.ts に統一してください。',
            },
          ],
        },
      ],
    },
  },
  // shadcn/ui registry source is kept close to upstream so default components remain drop-in usable.
  {
    files: [
      'packages/frontend/ui/src/components/ui/**/*.{ts,tsx}',
      'packages/frontend/ui/src/hooks/use-mobile.tsx',
      'packages/frontend/ui/src/hooks/use-toast.ts',
      'packages/frontend/ui/src/lib/utils.ts',
    ],
    rules: {
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-template-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'export-tsdoc/require-export-tsdoc': 'off',
      'import/order': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'no-restricted-imports': 'off',
      'prefer-arrow-callback': 'off',
      'react-refresh/only-export-components': 'off',
      'react/no-danger': 'off',
      'react/no-array-index-key': 'off',
      'security/detect-object-injection': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'unicorn/no-array-for-each': 'off',
    },
  },
  // theme.ts は行数制約を緩和
  {
    files: ['**/theme.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  // JavaScript ファイルの設定
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  // vitest config は型情報なしで lint
  {
    files: ['packages/frontend/ui/vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // 無視するファイル
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.wrangler/**',
      '**/drizzle/migrations/**',
      '**/.serena/**',
      'packages/typespec/openapi/**',
      'packages/typespec/tsp-output/**',
      '**/pnpm-lock.yaml',
    ],
  }
);
