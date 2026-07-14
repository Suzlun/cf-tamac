import 'server-only';

import type { TamacAgentRpcScope } from '@cf-tamac/sdk';

import { getClientWorkerEnv } from '../env';

/**
 * Management Client が server-side で解決した acting user context です。
 *
 * @remarks
 * `operatorId` と scope は Browser から受け取らず、Client Worker の信頼済み設定からだけ導出します。
 * SDK adapter はこの型を SDK の `ActingUserContext` と invocation scope へ分解して渡すため、
 * Browser bundle、JWT payload の組み立て、Client D1 の署名鍵保存責務をこの型へ混在させません。
 *
 * @example
 * ```ts
 * const actingUser = deriveActingUserContext();
 * ```
 */
export interface ActingUserContext {
  /** Agent audit と SDK JWT claim に渡す、server-side で検証済みの operator ID です。 */
  readonly operatorId: string;
  /** Agent control-plane の許可 scope と一致する、server-side で検証済みの最小権限 scope です。 */
  readonly scopes: readonly TamacAgentRpcScope[];
}

// Vitest で Cloudflare Worker binding を構成しない unit test だけが使う固定の server-side context です。
const TEST_ACTING_USER: ActingUserContext = {
  operatorId: 'agent-management-ui-test-operator',
  scopes: ['agent:read'],
};

/**
 * Server-side の信頼済み設定から acting user context を導出する。
 *
 * @returns Agent RPC audit/authorization に付与する operator ID と scopes。
 * @throws production runtime で Worker env が未設定の場合は fail closed する。
 */
export function deriveActingUserContext(): ActingUserContext {
  try {
    const env = getClientWorkerEnv();
    return {
      operatorId: env.CLIENT_ACTING_OPERATOR_ID,
      scopes: parseActingScopes(env.CLIENT_ACTING_SCOPES),
    };
  } catch (error) {
    if (isVitestRuntime()) {
      return TEST_ACTING_USER;
    }
    throw error;
  }
}

function parseActingScopes(scopes: string): readonly TamacAgentRpcScope[] {
  const resolvedScopes: TamacAgentRpcScope[] = [];
  // Worker env から空白区切り scope を一つずつ読み、SDK/Agent が認識する scope 以外を送信前に拒否します。
  for (const candidate of scopes.split(/\s+/)) {
    const scope = candidate.trim();
    if (scope === '') {
      continue;
    }
    if (!isTamacAgentRpcScope(scope)) {
      throw new TypeError(`Client acting user scope is not supported: ${scope}.`);
    }
    resolvedScopes.push(scope);
  }
  // 空 scope の署名 JWT を作らないよう、acting user derivation 境界で fail closed にします。
  if (resolvedScopes.length === 0) {
    throw new TypeError('Client acting user scopes are not configured.');
  }
  return resolvedScopes;
}

/**
 * 文字列が SDK と Agent control-plane の両方で許可する scope かを検査します。
 *
 * @param scope - Client Worker env から読み取った未検証の scope 文字列です。
 * @returns SDK invocation へ渡してよい scope の場合は `true`、それ以外は `false` を返します。
 * @remarks
 * scope を任意の文字列として SDK へ cast すると、設定誤りを認証 metadata 生成まで遅延させるため、
 * Client server boundary で明示的に narrowing します。
 */
function isTamacAgentRpcScope(scope: string): scope is TamacAgentRpcScope {
  return (
    scope === 'agent:read' ||
    scope === 'agent:write' ||
    scope === 'agent:tool:approve' ||
    scope === 'agent:integration:admin' ||
    scope === 'agent:admin'
  );
}

function isVitestRuntime(): boolean {
  return typeof process !== 'undefined' && process.env.VITEST === 'true';
}
