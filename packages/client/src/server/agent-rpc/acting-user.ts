import 'server-only';

import { getClientWorkerEnv } from '../env';

import type { ActingUserContext } from './authentication';

const TEST_ACTING_USER: ActingUserContext = {
  operatorId: 'client-management-test-operator',
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

function parseActingScopes(scopes: string): readonly string[] {
  return scopes
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope !== '');
}

function isVitestRuntime(): boolean {
  return typeof process !== 'undefined' && process.env.VITEST === 'true';
}
