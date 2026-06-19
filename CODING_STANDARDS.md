# コーディング規則

本書は lint、CI、git hooks が機械的に強制するルールだけを、人が一目で分かる形にまとめたものです。設定ファイルに書かれていないルールは、このリポジトリでは強制されません。

## 1. 本書の位置付け

- 正は設定と自動実行
- 本書は設定から抜き出した要約
- 乖離を見つけたら `opencode run --command rules.update-coding-standard` を実行して更新する

## 2. 目的

- 変更しても壊れにくい依存方向を強制する
- 生成物の改変や契約のズレを自動で検出する
- 初心者でも失敗しない最小ルールを明文化する

## 3. プロジェクト構造

この構造は依存方向チェックの入力として使われます。

ルール

- 依存方向チェックは以下のパスを層として扱う
  - 強制: `pnpm lint` → `eslint .` → `settings['boundaries/elements']` → `eslint.config.js`
  - NG例
    - `packages/backend/unknown/src/foo.ts` のような層外に置くと、依存方向チェックの層に含まれない
  - OK例
    - `packages/backend/usecases/src/foo.ts` のように、層に一致する場所へ置く

層の定義

- サーバー
  - `backend-entry`: `packages/backend/entry/src/index.ts`
  - `backend-app`: `packages/backend/app/src/**/*`
  - `backend-http`: `packages/backend/http/src/**/*`
  - `backend-persistence`: `packages/backend/persistence/src/**/*`
  - `backend-domain`: `packages/backend/domain/src/**/*`
  - `backend-usecases`: `packages/backend/usecases/src/**/*`
  - `backend-types`: `packages/backend/types/src/**/*`
- クライアント
  - `frontend-api`: `packages/frontend/api/src/**/*`
  - `frontend-domain`: `packages/frontend/domain/src/**/*`
  - `frontend-app`: `packages/frontend/app/src/**/*`
- 共通
  - `ui`: `packages/frontend/ui/src/**/*`
  - `drizzle`: `packages/backend/drizzle/src/**/*`
- 契約生成物
  - `typespec-openapi`: `packages/typespec/openapi/openapi.json`

ルール

- 層に属さない TS/TSX ファイルを作らない
  - 強制: `pnpm lint` → `eslint .` → `rules['boundaries/no-unknown-files']` → `eslint.config.js`
  - 対象
    - `packages/backend/**/src/**/*.{ts,tsx}`
    - `packages/frontend/**/src/**/*.{ts,tsx}`
    - `packages/frontend/ui/src/**/*.{ts,tsx}`
    - `packages/backend/drizzle/src/**/*.{ts,tsx}`
  - NG例
    - `packages/backend/foo/src/x.ts`（どの層にも一致しない）
  - OK例
    - `packages/backend/usecases/src/x.ts`（層に一致する）

## 4. 依存方向

ルール

- 許可されていない層への import をしない
  - 強制: `pnpm lint` → `eslint .` → `rules['boundaries/element-types']` → `eslint.config.js`
  - 補足
    - このリポジトリは default を禁止にしており、許可表にある依存だけを許可する
  - NG例
    ```ts
    // packages/backend/domain/src/foo.ts
    import { routes } from '@cfreact-template-backend/http';
    ```
  - OK例
    ```ts
    // packages/backend/domain/src/foo.ts
    import type { Something } from '@cfreact-template-backend/types';
    ```

許可表

- サーバー
  - `backend-domain` → `backend-domain`, `backend-types`
  - `backend-types` → `backend-types`
  - `backend-usecases` → `backend-domain`, `backend-usecases`, `backend-types`
  - `backend-persistence` → `backend-usecases`, `backend-domain`, `backend-types`, `backend-persistence`, `drizzle`
  - `backend-http` → `backend-http`, `backend-usecases`, `backend-domain`, `backend-types`, `typespec-openapi`
  - `backend-app` → `backend-app`, `backend-http`, `backend-persistence`, `backend-usecases`, `backend-domain`, `backend-types`
  - `backend-entry` → `backend-app`
- クライアント
  - `frontend-api` → `frontend-api`
  - `frontend-domain` → `frontend-domain`, `frontend-api`
  - `frontend-app` → `frontend-app`, `frontend-domain`, `ui`
- 共通
  - `ui` → `ui`
  - `drizzle` → `drizzle`

ルール

- 層から層外ファイルを import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['boundaries/no-unknown']` → `eslint.config.js`
  - NG例
    ```ts
    // packages/backend/http/src/x.ts
    import something from '../../../../scripts/something';
    ```
  - OK例
    ```ts
    // 層に属する場所へ移動してから import する
    ```

## 5. import / export

ルール

- import の拡張子を付けない
  - 強制: `pnpm lint` → `eslint .` → `rules['import/extensions']` → `eslint.config.js`
  - NG例
    ```ts
    import { x } from './x.ts';
    ```
  - OK例
    ```ts
    import { x } from './x';
    ```

- `packages/**/*.{ts,tsx}` から `.js/.mjs/.cjs` を import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { foo } from './foo.js';
    ```
  - OK例
    ```ts
    import { foo } from './foo';
    ```

- import 順序は `builtin → external → internal → parent/sibling/index → type` にし、グループ間に空行を入れる
  - 強制: `pnpm lint` → `eslint .` → `rules['import/order']` → `eslint.config.js`
  - NG例
    ```ts
    import { z } from 'zod';
    import fs from 'node:fs';
    ```
  - OK例

    ```ts
    import fs from 'node:fs';

    import { z } from 'zod';
    ```

- `packages/**/index.ts` は re-export のみで、実装と default export を禁止
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/**/index.ts']`
  - NG例
    ```ts
    // packages/foo/index.ts
    export default function f() {
      return 1;
    }
    ```
  - OK例
    ```ts
    // packages/foo/index.ts
    export * from './src/something';
    export { something } from './src/something';
    ```

- `packages/**/src/**/*.{ts,tsx}` では各ディレクトリの `index.ts` 経由で import する
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/**/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { parse } from '@cfreact-template-backend/domain/utils/parse';
    import { parse2 } from './utils/parse2';
    ```
  - OK例
    ```ts
    import { parse, parse2 } from '@cfreact-template-backend/domain';
    import { something } from './utils';
    ```

- サーバーと UI と Drizzle は上位ディレクトリ参照の相対 import を禁止し、エイリアスを使う
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js`
  - 対象
    - `packages/backend/**/src/**/*.{ts,tsx}`
    - `packages/frontend/ui/src/**/*.{ts,tsx}`
    - `packages/backend/drizzle/src/**/*.ts`
  - NG例
    ```ts
    import { x } from '../domain/x';
    ```
  - OK例
    ```ts
    import { x } from '@cfreact-template-backend/domain';
    ```

- ESLint の disable コメントは未使用を残さない
  - 強制: `pnpm lint` → `eslint .` → `rules['eslint-comments/no-unused-disable']` → `eslint.config.js`
  - NG例
    ```ts
    // eslint-disable-next-line no-alert
    const x = 1;
    ```
  - OK例
    ```ts
    // eslint-disable-next-line no-alert -- legacy UI で alert が必要
    alert('ok');
    ```

- ESLint の disable は enable と対にする
  - 強制: `pnpm lint` → `eslint .` → `rules['eslint-comments/disable-enable-pair']` → `eslint.config.js`
  - NG例
    ```ts
    /* eslint-disable no-alert */
    alert('x');
    ```
  - OK例
    ```ts
    /* eslint-disable no-alert */
    alert('x');
    /* eslint-enable no-alert */
    ```

## 6. 公開 API のドキュメント

ルール

- `packages/**/src/**/*.{ts,tsx}` の export には直前に TSDoc を付ける
  - 強制: `pnpm lint` → `eslint .` → `rules['export-tsdoc/require-export-tsdoc']` → `eslint.config.js`
  - 対象外
    - `packages/frontend/api/src/generated/**/*.{ts,tsx}`
    - `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx`
  - NG例
    ```ts
    export function hello() {
      return 'hi';
    }
    ```
  - OK例
    ```ts
    /**
     * 挨拶文を返す
     */
    export function hello() {
      return 'hi';
    }
    ```

ルール

- 公開 API の契約と SDK の生成物を手で編集しない
  - 強制: `pnpm check:codegen` → `scripts.check:codegen` → `package.json`
  - 強制: pre-commit hook → `pnpm check:codegen` → `.husky/pre-commit`
  - 生成物
    - `packages/typespec/openapi/openapi.json`
    - `packages/frontend/api/src/generated/client.ts`
  - 生成物は git 管理対象
    - 強制: `pnpm check:codegen` 内の `git ls-files --error-unmatch ...` → `package.json`
  - 再生成
    - `pnpm gen:api-sdk`
  - 入力と出力の定義
    - TypeSpec の入口: `packages/typespec/main.tsp`
    - OpenAPI の出力: `packages/typespec/tspconfig.yaml` の `options['@typespec/openapi3'].output-file` と `options['@typespec/openapi3'].emitter-output-dir`
    - SDK の出力: `packages/frontend/api/orval.config.ts` の `input` と `output.target`
  - NG例
    ```diff
    -  "title": "cfreact-template API"
    +  "title": "my manual edit"
    ```
  - OK例
    ```sh
    pnpm gen:api-sdk
    ```

## 7. TypeScript

ルール

- `any` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-explicit-any']` → `eslint.config.js`
  - NG例
    ```ts
    const x: any = 1;
    ```
  - OK例
    ```ts
    const x: number = 1;
    ```

- unsafe な代入と呼び出しとメンバーアクセスをしない
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-unsafe-assignment']` → `eslint.config.js`
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-unsafe-call']` → `eslint.config.js`
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-unsafe-member-access']` → `eslint.config.js`
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-unsafe-return']` → `eslint.config.js`
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-unsafe-argument']` → `eslint.config.js`
  - NG例
    ```ts
    const obj: unknown = JSON.parse('{}');
    obj.x.y();
    ```
  - OK例
    ```ts
    const obj: unknown = JSON.parse('{}');
    if (typeof obj === 'object' && obj && 'x' in obj) {
      // ここで絞り込む
    }
    ```

- 条件式で文字列や数値の truthy 判定をしない
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/strict-boolean-expressions']` → `eslint.config.js`
  - NG例
    ```ts
    if (userId) {
      doSomething();
    }
    ```
  - OK例
    ```ts
    if (userId !== '') {
      doSomething();
    }
    ```

- `Promise` を握りつぶさない
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-floating-promises']` → `eslint.config.js`
  - NG例
    ```ts
    doAsync();
    ```
  - OK例
    ```ts
    await doAsync();
    ```

- `import type` を使う
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/consistent-type-imports']` → `eslint.config.js`
  - NG例
    ```ts
    import { User } from './types';
    ```
  - OK例
    ```ts
    import type { User } from './types';
    ```

- 未使用の変数と引数を残さない
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/no-unused-vars']` → `eslint.config.js`
  - 例外
    - `_` で始まる名前は未使用を許可
  - NG例
    ```ts
    function f(x: number) {
      return 1;
    }
    ```
  - OK例
    ```ts
    function f(_x: number) {
      return 1;
    }
    ```

- `debugger` を残さない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-debugger']` → `eslint.config.js`
  - NG例
    ```ts
    debugger;
    ```
  - OK例
    ```ts
    // 削除する
    ```

- `alert` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-alert']` → `eslint.config.js`
  - NG例
    ```ts
    alert('x');
    ```
  - OK例
    ```ts
    // alert を削除し、UI で表現する
    ```

- `var` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-var']` → `eslint.config.js`
  - NG例
    ```ts
    var x = 1;
    ```
  - OK例
    ```ts
    const x = 1;
    ```

- `Array.prototype.forEach` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['unicorn/no-array-for-each']` → `eslint.config.js`
  - NG例
    ```ts
    items.forEach((x) => console.log(x));
    ```
  - OK例
    ```ts
    for (const x of items) {
      console.log(x);
    }
    ```

- `eval` と `new Function` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-eval']`, `rules['no-new-func']` → `eslint.config.js`
  - NG例
    ```ts
    const f = new Function('return 1');
    ```
  - OK例
    ```ts
    const f = () => 1;
    ```

## 8. クライアント実装規則

ルール

- App 層から API パッケージを直接 import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/app/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { apiClient } from '@cfreact-template-frontend/api';
    ```
  - OK例
    ```ts
    import { useUsers } from '@cfreact-template-frontend/domain/hooks/useUsers';
    ```

- Pages と Components で `@cfreact-template-frontend/domain` をまとめ import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/app/src/pages/**/*.{ts,tsx}', 'packages/frontend/app/src/components/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { useUsers } from '@cfreact-template-frontend/domain';
    ```
  - OK例
    ```ts
    import { useUsers } from '@cfreact-template-frontend/domain/hooks/useUsers';
    ```

- Pages と Components と Hooks で `fetch` を直接呼ばない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/frontend/app/src/**/*.{ts,tsx}', 'packages/frontend/domain/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    const res = await fetch('/api');
    ```
  - OK例
    ```ts
    // packages/frontend/domain/src/hooks/useUsers.ts
    const res = await apiClient.users.listUsers();
    ```

- `axios` と `cross-fetch` を import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/app/src/**/*.{ts,tsx}', 'packages/frontend/domain/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import axios from 'axios';
    ```
  - OK例
    ```ts
    // packages/frontend/domain/src/hooks/useUsers.ts
    import { apiClient } from '@cfreact-template-frontend/api';
    ```

- `pages/` 直下に TSX を置かない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/frontend/app/src/pages/*.tsx']`
  - NG例
    - `packages/frontend/app/src/pages/Home.tsx`
  - OK例
    - `packages/frontend/app/src/pages/home/Home.tsx`

- Pages では `useState` 以外の React 組み込み Hooks を直接使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` と `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/app/src/pages/**/*.{ts,tsx}']`
  - NG例

    ```tsx
    import { useEffect } from 'react';

    export function Page() {
      useEffect(() => {}, []);
      return null;
    }
    ```

  - OK例

    ```tsx
    import { useUsers } from '@cfreact-template-frontend/domain/hooks/useUsers';

    export function Page() {
      const { data } = useUsers();
      return <div>{data.status}</div>;
    }
    ```

- Pages では `useMemo` と `useCallback` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` と `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/app/src/pages/**/*.{ts,tsx}']`
  - NG例

    ```tsx
    import { useMemo } from 'react';

    const x = useMemo(() => 1, []);
    ```

  - OK例
    ```tsx
    // 最適化が必要なら components または hooks へ移す
    ```

- Components では `useState` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` と `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/app/src/components/**/*.{ts,tsx}']`
  - NG例
    ```tsx
    import { useState } from 'react';
    ```
  - OK例
    ```tsx
    import { useUsers } from '@cfreact-template-frontend/domain/hooks/useUsers';
    ```

- Components で使える React 組み込み Hooks は `useMemo` と `useCallback` だけ
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` と `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/app/src/components/**/*.{ts,tsx}']`
  - NG例
    ```tsx
    import { useEffect } from 'react';
    ```
  - OK例
    ```tsx
    import { useMemo } from 'react';
    ```

- React Hooks のルールを守る
  - 強制: `pnpm lint` → `eslint .` → `rules['react-hooks/rules-of-hooks']` と `rules['react-hooks/exhaustive-deps']` → `eslint.config.js`
  - NG例

    ```tsx
    import { useEffect } from 'react';

    // packages/frontend/ui/src/components/Comp.tsx

    export function Comp({ id }: { id: string }) {
      if (id !== '') {
        useEffect(() => {}, []);
      }
      return null;
    }
    ```

  - OK例

    ```tsx
    import { useEffect } from 'react';

    // packages/frontend/ui/src/components/Comp.tsx

    export function Comp({ id }: { id: string }) {
      useEffect(() => {
        void id;
      }, [id]);
      return null;
    }
    ```

- 配列を JSX で描画するときは `key` を付ける
  - 強制: `pnpm lint` → `eslint .` → `rules['react/jsx-key']` → `eslint.config.js`
  - NG例
    ```tsx
    {
      items.map((x) => <li>{x.name}</li>);
    }
    ```
  - OK例
    ```tsx
    {
      items.map((x) => <li key={x.id}>{x.name}</li>);
    }
    ```

- 画像には代替テキストを付ける
  - 強制: `pnpm lint` → `eslint .` → `rules['jsx-a11y/alt-text']` → `eslint.config.js`
  - NG例
    ```tsx
    <img src="/logo.png" />
    ```
  - OK例
    ```tsx
    <img src="/logo.png" alt="logo" />
    ```

- `dangerouslySetInnerHTML` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['react/no-danger']` → `eslint.config.js`
  - NG例
    ```tsx
    <div dangerouslySetInnerHTML={{ __html: html }} />
    ```
  - OK例
    ```tsx
    <div>{text}</div>
    ```

ルール

- hooks ディレクトリで export できる値は `useXxx` だけ
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/frontend/domain/src/hooks/**/*.{ts,tsx}']`
  - NG例
    ```ts
    export const foo = 1;
    ```
  - OK例
    ```ts
    export function useFoo() {
      return { data: { status: 'ok' }, actions: {} };
    }
    ```

- hooks は `data` と `actions` をまとめて返し、戻り値に型注釈を付ける
  - 強制: `pnpm lint` → `eslint .` → `rules['hooks-domain/require-domain-structure']` → `eslint.config.js`
  - NG例
    ```ts
    export function useFoo() {
      return { data: { status: 'ok' } };
    }
    ```
  - OK例

    ```ts
    type FooData = { status: 'ok' };
    type FooActions = {};

    export function useFoo(): { data: FooData; actions: FooActions } {
      return { data: { status: 'ok' }, actions: {} };
    }
    ```

- hooks から `apiClient` を返す、再エクスポートする
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/frontend/domain/src/hooks/**/*.{ts,tsx}']`
  - NG例
    ```ts
    export { apiClient } from '@cfreact-template-frontend/api';
    ```
  - OK例
    ```ts
    export function useUsers() {
      return { data: { users: [] }, actions: { reload: () => {} } };
    }
    ```

- hooks の型 import は `types` 経由に限定する
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/frontend/domain/src/hooks/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import type { User } from '../models/user';
    ```
  - OK例
    ```ts
    import type { User } from 'types';
    ```

- hooks では UI 層の import をしない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/frontend/domain/src/hooks/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { Button } from '@cfreact-template-frontend/app/components/Button';
    ```
  - OK例
    ```ts
    // UI は hooks の戻り値を使う
    ```

- hooks のファイル名は camelCase にする
  - 強制: `pnpm lint` → `eslint .` → `rules['unicorn/filename-case']` → `eslint.config.js`
  - NG例
    - `use_users.ts`
  - OK例
    - `useUsers.ts`

- hooks の関数名は `use` で始まり、`useXxx` の形にする
  - 強制: `pnpm lint` → `eslint .` → `rules['@typescript-eslint/naming-convention']` → `eslint.config.js`
  - NG例
    ```ts
    export function useusers() {
      return { data: {}, actions: {} };
    }
    ```
  - OK例
    ```ts
    export function useUsers() {
      return { data: {}, actions: {} };
    }
    ```

## 9. サーバー実装規則

ルール

- サーバーの App パッケージの内部パスを import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/**/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { buildDeps } from '@cfreact-template-backend/app/server';
    ```
  - OK例
    ```ts
    import { buildDeps } from '@cfreact-template-backend/app';
    ```

- Domain と UseCase では `console` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-console']` → `eslint.config.js` の `files: ['packages/backend/domain/src/**/*.{ts,tsx}', 'packages/backend/usecases/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    console.log('x');
    ```
  - OK例
    ```ts
    // ログは外側の層で行う
    ```

- Domain と UseCase では `fetch` と `Request` と `Response` と `Headers` を使わない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-globals']` → `eslint.config.js`
  - NG例
    ```ts
    const res = await fetch('https://example.com');
    ```
  - OK例
    ```ts
    // 外側の層が I/O を行い、内側は純粋な入力で処理する
    ```

- Domain と UseCase ではフレームワークとインフラ依存を import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/domain/src/**/*.{ts,tsx}', 'packages/backend/usecases/src/**/*.{ts,tsx}']`
  - 対象
    - `hono`, `drizzle-orm`, `@cloudflare/**`, `cloudflare:*`, `zod`, `@hono/zod-openapi`
  - NG例
    ```ts
    import { z } from 'zod';
    ```
  - OK例
    ```ts
    // スキーマや HTTP 依存は HTTP アダプタに置く
    ```

- Domain と UseCase では外部ライブラリを import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['boundaries/external']` → `eslint.config.js`
  - NG例
    ```ts
    import { v4 as uuidv4 } from 'uuid';
    ```
  - OK例
    ```ts
    // 外部依存が必要なら外側の層に移し、内側は入力として受け取る
    ```

- Domain と UseCase から Adapters を参照しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/domain/src/**/*.{ts,tsx}', 'packages/backend/usecases/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { db } from '@cfreact-template-backend/persistence';
    ```
  - OK例
    ```ts
    import type { UserRepository } from '@cfreact-template-backend/domain';
    ```

- UseCase で `throw new Error` をしない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/backend/usecases/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    throw new Error('failed');
    ```
  - OK例
    ```ts
    throw new DomainError('failed');
    ```

- UseCase の複雑度を上げない
  - 強制: `pnpm lint` → `eslint .` → `rules['sonarjs/cognitive-complexity']` → `eslint.config.js` の `files: ['packages/backend/usecases/src/**/*.{ts,tsx}']`
  - 強制: `pnpm lint` → `eslint .` → `rules['complexity']` → `eslint.config.js` の `files: ['packages/backend/usecases/src/**/*.{ts,tsx}']`
  - 強制: `pnpm lint` → `eslint .` → `rules['max-depth']` → `eslint.config.js` の `files: ['packages/backend/usecases/src/**/*.{ts,tsx}']`
  - しきい値
    - Cognitive Complexity: 10
    - Complexity: 10
    - Max Depth: 3
  - NG例
    ```ts
    export async function useCase(x: number) {
      if (x > 0) {
        if (x > 1) {
          if (x > 2) {
            if (x > 3) {
              return 4;
            }
          }
        }
      }
      return 0;
    }
    ```
  - OK例
    ```ts
    // 分岐を Domain の関数へ移し、UseCase は手順だけにする
    export async function useCase(x: number) {
      return await doDomainRule(x);
    }
    ```

- UseCase で `AppVariables` を定義しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/backend/usecases/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    export type AppVariables = {};
    ```
  - OK例
    ```ts
    // HTTP アダプタで管理する
    ```

ルール

- HTTP アダプタから Persistence を直接参照しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/http/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { userRepo } from '@cfreact-template-backend/persistence';
    ```
  - OK例
    ```ts
    import { createUser } from '@cfreact-template-backend/usecases';
    ```

- HTTP アダプタで `c.env` を参照しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/backend/http/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    const db = c.env.DB;
    ```
  - OK例
    ```ts
    const db = deps.db;
    ```

- HTTP アダプタから App 層を参照しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/http/src/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { buildDeps } from '@cfreact-template-backend/app';
    ```
  - OK例
    ```ts
    import type { AppDependencies } from '@cfreact-template-backend/usecases';
    ```

- `zod` は `packages/backend/http/src/schemas` でだけ使う
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/http/src/**/*.{ts,tsx}']` と `files: ['packages/backend/http/src/schemas/**/*.{ts,tsx}']`
  - NG例
    ```ts
    // packages/backend/http/src/routes/foo.ts
    import { z } from 'zod';
    ```
  - OK例
    ```ts
    // packages/backend/http/src/schemas/foo.ts
    import { z } from 'zod';
    ```

- `createRoute` と `OpenAPIHono` は `packages/backend/http/src/routes` でだけ import する
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/http/src/**/*.{ts,tsx}']` と `files: ['packages/backend/http/src/schemas/**/*.{ts,tsx}']`
  - NG例
    ```ts
    // packages/backend/http/src/context.ts
    import { OpenAPIHono } from '@hono/zod-openapi';
    ```
  - OK例
    ```ts
    // packages/backend/http/src/routes/v1.ts
    import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
    ```

- OpenAPI ルートで `hono` を import しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-imports']` → `eslint.config.js` の `files: ['packages/backend/http/src/routes/**/*.{ts,tsx}']`
  - NG例
    ```ts
    import { Hono } from 'hono';
    ```
  - OK例
    ```ts
    import { OpenAPIHono } from '@hono/zod-openapi';
    ```

ルール

- `packages/backend/app/src/server.ts` で KV と R2 を Context に直接注入しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/backend/app/src/server.ts']`
  - NG例
    ```ts
    c.set('kv', env.KV);
    ```
  - OK例
    ```ts
    // UseCase 経由で必要な操作だけを依存として渡す
    ```

- `packages/backend/http/src/context.ts` で `AppVariables` に `kv` と `r2` を追加しない
  - 強制: `pnpm lint` → `eslint .` → `rules['no-restricted-syntax']` → `eslint.config.js` の `files: ['packages/backend/http/src/context.ts']`
  - NG例
    ```ts
    export type AppVariables = { kv: unknown };
    ```
  - OK例
    ```ts
    export type AppVariables = { deps: unknown };
    ```

## 10. サイズ制約

ルール

- `packages/**/src/**/*.{ts,tsx}` は 1 ファイル 500 行以内にする
  - 強制: `pnpm lint` → `eslint .` → `rules['max-lines']` → `eslint.config.js` と `.eslintrc-maxlines.json`
  - NG例
    - 600 行の巨大ファイル
  - OK例
    - 分割して 500 行以内

- `packages/**/src/**/*.{ts,tsx}` は 1 関数 100 行以内にする
  - 強制: `pnpm lint` → `eslint .` → `rules['max-lines-per-function']` → `eslint.config.js` と `.eslintrc-maxlines.json`
  - NG例
    - 150 行の関数
  - OK例
    - 関数を分割して 100 行以内

## 11. 例外

ルール

- 生成コードは lint の一部ルールを緩和する
  - 強制: `pnpm lint` → `eslint .` → `files: ['packages/frontend/api/src/generated/**/*.{ts,tsx}']` のルール上書き → `eslint.config.js`
  - NG例
    - 生成コードを手で直しても `pnpm check:codegen` で差分が戻る
  - OK例
    - 入力元を変更して `pnpm gen:api-sdk`

- shadcn/ui registry 由来コードは上流API形状を保つため lint の一部ルールを緩和する
  - 強制: `pnpm lint` → `eslint .` → `files: ['packages/frontend/ui/src/components/ui/**/*.{ts,tsx}', 'packages/frontend/ui/src/hooks/use-mobile.tsx', 'packages/frontend/ui/src/hooks/use-toast.ts', 'packages/frontend/ui/src/lib/utils.ts']` のルール上書き → `eslint.config.js`
  - 対象
    - shadcn/ui のデフォルトコンポーネント実装
    - shadcn/ui が要求する `cn`, `use-mobile`, `use-toast`
  - 補足
    - app 固有コンポーネントや hand-written の UI 追加には通常ルールを適用する
  - OK例
    - upstream registry 由来の export 形状、内部サブパス import、React 参照型は対象ファイル内で維持する

- テストは制約を一部緩和する
  - 強制: `pnpm lint` → `eslint .` → `files: ['**/*.test.*', '**/*.spec.*']` のルール上書き → `eslint.config.js`
  - NG例
    - 本番コードと同じ制約で書く必要があると思い込む
  - OK例
    - テストでは制約が一部オフになっている前提で書く

- `**/theme.ts` は行数制約を除外する
  - 強制: `pnpm lint` → `eslint .` → `files: ['**/theme.ts']` の `max-lines` オフ → `eslint.config.js`
  - NG例
    - theme の分割で逆に可読性が落ちる
  - OK例
    - theme は 500 行超でも許可

## 12. 変更手順

このリポジトリで失敗条件になる自動実行

- pre-commit hook
  - 強制: `.husky/pre-commit`
  - 実行
    - `pnpm lint-staged`
    - `pnpm check:codegen`
- commit-msg hook
  - 強制: `.husky/commit-msg`
  - 実行
    - `pnpm commitlint --edit $1`
- pre-push hook
  - 強制: `.husky/pre-push`
  - 実行
    - `pnpm lint`

fail 条件

- `pnpm lint` は ESLint の error、OpenSpec チェック、サプライチェーン設定チェックで失敗する
  - 強制: `scripts.lint` → `package.json`
  - 内訳
    - `pnpm lint:eslint` は `eslint .` を実行
    - `pnpm lint:openspec` は `openspec validate --all --strict` と `node scripts/openspec/verify-scenario-coverage.mjs` を実行
    - `pnpm lint:supply-chain` は `node scripts/security/verify-pnpm-supply-chain.mjs` を実行
- サプライチェーン対策の pnpm 設定を弱めない
  - 強制: `pnpm lint:supply-chain` → `scripts/security/verify-pnpm-supply-chain.mjs`
  - 必須
    - `pnpm-workspace.yaml` の `minimumReleaseAge` は 4320 分以上
    - `allowBuilds` で install script 実行を明示許可制にする
    - `dangerouslyAllowAllBuilds: true` を禁止する
    - `minimumReleaseAgeExclude` による72時間猶予の迂回を禁止する
- `pnpm check:codegen` は生成物のドリフトで失敗する
  - 強制: `scripts.check:codegen` → `package.json`
  - 実行
    - `pnpm gen:api-sdk`
    - `git diff --exit-code -- packages/typespec/openapi/openapi.json packages/frontend/api/src/generated/client.ts`
- CI は `pnpm format:check` と `pnpm check` と `pnpm test:run` も実行する
  - 強制: `.github/workflows/ci.yml`

フォーマット

- 変更を含むコミットでは lint-staged が Prettier と ESLint の自動修正を走らせる
  - 強制: pre-commit hook → `pnpm lint-staged` → `.husky/pre-commit`
  - 強制: `.lintstagedrc.json`
  - 実行
    - `*.{ts,tsx,js,jsx}` は `eslint --fix` と `prettier --write`
    - `*.{json,md}` は `prettier --write`
- CI では Prettier をチェックする
  - 強制: `pnpm format:check` → `scripts.format:check` → `package.json`
  - 設定: `.prettierrc.json`
  - NG例
    ```ts
    const x = 1;
    ```
  - OK例
    ```ts
    const x = 1;
    ```

- CI では TypeSpec のフォーマットをチェックする
  - 強制: `pnpm format:check` → `scripts.format:check` → `package.json`
  - 強制: `pnpm --filter @cfreact-template/typespec format:check` → `scripts.format:check` → `packages/typespec/package.json`
  - NG例
    - `packages/typespec/**/*.tsp` の整形が崩れている
  - OK例
    ```sh
    pnpm --filter @cfreact-template/typespec format
    ```

- CI では TypeSpec がコンパイルできることをチェックする
  - 強制: CI → `pnpm check` → `.github/workflows/ci.yml`
  - 強制: `pnpm check` → `scripts.check` → `package.json`
  - 強制: `pnpm --filter @cfreact-template/typespec check` → `scripts.check` → `packages/typespec/package.json`
  - NG例
    - `packages/typespec/main.tsp` の記法ミス
  - OK例
    ```sh
    pnpm --filter @cfreact-template/typespec check
    ```

コミットメッセージ

- Conventional Commits の type は許可リストから選ぶ
  - 強制: commit-msg hook → `pnpm commitlint --edit $1` → `.husky/commit-msg`
  - 強制: `rules['type-enum']` → `commitlint.config.js`
  - 許可
    - `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
  - NG例
    ```text
    feature: add login
    ```
  - OK例
    ```text
    feat: add login
    ```

## 13. OpenSpec: 仕様を自動テストで担保する

ルール

- OpenSpec の spec は `openspec validate --all --strict` を通す
  - 強制: `pnpm lint` → `pnpm lint:openspec` → `scripts.lint:openspec` → `package.json`
  - NG例
    - `pnpm lint` で OpenSpec validate が失敗する
  - OK例
    ```sh
    pnpm lint:openspec
    ```

- Spec は `openspec/specs/**/spec.md` に置く
  - 強制: `pnpm lint` → `node scripts/openspec/verify-scenario-coverage.mjs` → `scripts/openspec/verify-scenario-coverage.mjs`
  - NG例
    - `openspec/changes/.../spec.md` だけを更新して main spec に反映しない
  - OK例
    - main spec を更新して lint 対象に含める

- Scenario 見出しは `#### Scenario:` で始め、末尾に安定 ID を付ける
  - 強制: `pnpm lint` → `node scripts/openspec/verify-scenario-coverage.mjs` → `scripts/openspec/verify-scenario-coverage.mjs` の `extractScenarioId`
  - 形式
    - `#### Scenario: ... (USER-MGMT-S001)`
  - NG例
    ```md
    #### Scenario: Create user
    ```
  - OK例
    ```md
    #### Scenario: Create user (USER-MGMT-S001)
    ```

- Scenario ID は `^[\dA-Z]+(?:-[\dA-Z]+)*-S\d{3,}$` に一致させる
  - 強制: `pnpm lint` → `node scripts/openspec/verify-scenario-coverage.mjs` → `scripts/openspec/verify-scenario-coverage.mjs` の `SCENARIO_ID_PATTERN`
  - NG例
    ```md
    #### Scenario: Create user (user-mgmt-1)
    ```
  - OK例
    ```md
    #### Scenario: Create user (USER-MGMT-S001)
    ```

- `Tags: manual` を付けた Scenario はカバレッジ必須から外す
  - 強制: `pnpm lint` → `node scripts/openspec/verify-scenario-coverage.mjs` → `scripts/openspec/verify-scenario-coverage.mjs` の `isManualScenario`
  - NG例

    ```md
    #### Scenario: Hard to automate (PAYMENTS-S014)

    - GIVEN ...
    ```

  - OK例

    ```md
    #### Scenario: Hard to automate (PAYMENTS-S014)

    Tags: manual

    - GIVEN ...
    ```

- manual でない Scenario はテストタイトルで参照する
  - 強制: `pnpm lint` → `node scripts/openspec/verify-scenario-coverage.mjs` → `scripts/openspec/verify-scenario-coverage.mjs` の `SCENARIO_REF_PATTERN`
  - NG例
    ```ts
    it('create user', async () => {});
    ```
  - OK例
    ```ts
    it('[USER-MGMT-S001] create user', async () => {});
    ```

- Spec に同じ Scenario ID を複数置かない
  - 強制: `pnpm lint` → `node scripts/openspec/verify-scenario-coverage.mjs` → `scripts/openspec/verify-scenario-coverage.mjs` の `getDuplicateScenarioErrors`
  - NG例
    - 2 つの `spec.md` に同じ ID がある
  - OK例
    - ID を一意にする

- Spec にない Scenario ID をテストで参照しない
  - 強制: `pnpm lint` → `node scripts/openspec/verify-scenario-coverage.mjs` → `scripts/openspec/verify-scenario-coverage.mjs` の `orphans`
  - NG例
    ```ts
    test('[USER-MGMT-S999] typo', async () => {});
    ```
  - OK例
    ```ts
    test('[USER-MGMT-S001] create user', async () => {});
    ```
