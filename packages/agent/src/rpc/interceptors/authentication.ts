import { Code } from '@connectrpc/connect';

import { loadControlPlaneTrustConfig, verifyClientServiceJwt } from '../../domain/security';

import type { AgentRpcGuardRejection } from './types';
import type {
  AgentControlPlaneScope,
  AgentPrincipalContext,
  AgentPrincipalType,
} from '../../domain/security';
import type { ClientServiceJwtFailureReason } from '../../domain/security/jwt';
import type { AgentWorkerEnv } from '../../env';

/**
 * Agent RPC authentication が確定した principal です。
 */
export interface AuthenticatedAgentPrincipal extends AgentPrincipalContext {
  readonly authenticationMode: 'bearer' | 'test';
}

/**
 * Agent RPC authentication seam の入力 option です。
 */
export interface AgentAuthenticationOptions {
  readonly allowTestSeam?: boolean;
  readonly env?: AgentWorkerEnv;
  readonly expectedAgentId?: string;
  readonly expectedKeyFingerprint?: string;
  readonly nowUnixSeconds?: number;
  readonly requiredScopes?: readonly AgentControlPlaneScope[];
}

/**
 * Agent RPC authentication seam の結果です。
 */
export type AgentAuthenticationResult =
  | {
      readonly principal: AuthenticatedAgentPrincipal;
      readonly rejection?: undefined;
    }
  | {
      readonly principal?: undefined;
      readonly rejection: AgentRpcGuardRejection;
    };

/**
 * Agent RPC request を Client Service bearer JWT または test-only seam で認証します。
 *
 * @param request Connect binary Protobuf facade が受け取った request です。
 * @param options Worker env と test seam 許可を含む実行条件です。
 * @returns 認証済み principal、または domain handling 前に返す拒否です。
 */
export async function authenticateAgentRequest(
  request: Request,
  options: AgentAuthenticationOptions = {}
): Promise<AgentAuthenticationResult> {
  const bearerToken = readBearerToken(request);
  const hasAuthorizationHeader = request.headers.has('Authorization');
  if (hasAuthorizationHeader && bearerToken === undefined && options.env !== undefined) {
    return {
      rejection: {
        code: Code.Unauthenticated,
        message: 'Agent RPC authentication requires a valid Authorization: Bearer token.',
        reason: 'invalid_authorization_header',
      },
    };
  }
  if (bearerToken !== undefined && options.env !== undefined) {
    return authenticateBearerToken(bearerToken, options);
  }

  // production path では env が渡されるため、test seam は明示許可された runtime だけで使います。
  if (isTestSeamAllowed(options) && !hasAuthorizationHeader) {
    const testPrincipal = authenticateTestPrincipal(request);
    if (testPrincipal !== undefined) {
      return { principal: testPrincipal };
    }
  }

  return {
    rejection: {
      code: Code.Unauthenticated,
      message: 'Agent RPC authentication requires Authorization: Bearer token.',
      reason: 'missing_bearer_token',
    },
  };
}

async function authenticateBearerToken(
  token: string,
  options: AgentAuthenticationOptions
): Promise<AgentAuthenticationResult> {
  const env = options.env;
  if (env === undefined) {
    return {
      rejection: {
        code: Code.Unauthenticated,
        message: 'Agent RPC authentication environment is unavailable.',
        reason: 'missing_auth_environment',
      },
    };
  }

  try {
    // Trust config は Worker secret 由来の公開鍵 policy だけを読み、private material を受け入れません。
    const trustConfig = await loadControlPlaneTrustConfig(env.AGENT_CONTROL_PLANE_TRUST);
    const verification = await verifyClientServiceJwt(token, {
      expectedAgentId: options.expectedAgentId,
      expectedAudience: env.AGENT_RPC_AUDIENCE,
      expectedKeyFingerprint: options.expectedKeyFingerprint,
      nowUnixSeconds: options.nowUnixSeconds,
      requiredScopes: options.requiredScopes,
      trustConfig,
    });
    if (verification.status === 'rejected') {
      return {
        rejection: {
          code: mapJwtFailureToConnectCode(verification.reason),
          message: verification.message,
          reason: verification.reason,
        },
      };
    }
    return { principal: { ...verification.principal, authenticationMode: 'bearer' } };
  } catch {
    // trust config の parse/schema failure は設定不備でも fail closed し、secret 内容は返しません。
    return {
      rejection: {
        code: Code.Unauthenticated,
        message: 'Agent control-plane trust config is invalid.',
        reason: 'invalid_trust_config',
      },
    };
  }
}

function authenticateTestPrincipal(request: Request): AuthenticatedAgentPrincipal | undefined {
  const testPrincipalId = request.headers.get('x-agent-test-principal-id');
  if (testPrincipalId === null || testPrincipalId.trim() === '') {
    return undefined;
  }
  return {
    actingUserId: normalizeOptionalHeader(request.headers.get('x-agent-test-acting-user-id')),
    agentId: normalizeOptionalHeader(request.headers.get('x-agent-test-agent-id')) ?? '*',
    audience: normalizeOptionalHeader(request.headers.get('x-agent-test-audience')),
    authenticationMode: 'test',
    fingerprint: normalizeOptionalHeader(request.headers.get('x-agent-test-fingerprint')),
    issuer: normalizeOptionalHeader(request.headers.get('x-agent-test-issuer')),
    jwtId: normalizeOptionalHeader(request.headers.get('x-agent-test-jwt-id')),
    keyId: normalizeOptionalHeader(request.headers.get('x-agent-test-key-id')),
    principalId: testPrincipalId.trim(),
    principalType:
      parsePrincipalType(request.headers.get('x-agent-test-principal-type')) ?? 'CLIENT_SERVICE',
    scopes: parseScopes(request.headers.get('x-agent-test-scopes')),
    subject: normalizeOptionalHeader(request.headers.get('x-agent-test-subject')),
  };
}

function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('Authorization');
  if (authorization === null) return undefined;
  const [scheme, token, extra] = authorization.trim().split(/\s+/u);
  if (extra !== undefined || scheme !== 'Bearer' || token === undefined || token === '') {
    return undefined;
  }
  return token;
}

function mapJwtFailureToConnectCode(reason: ClientServiceJwtFailureReason): Code {
  if (
    reason === 'agent_scope_denied' ||
    reason === 'invalid_agent_scope' ||
    reason === 'missing_scope' ||
    reason === 'scope_denied'
  ) {
    return Code.PermissionDenied;
  }
  return Code.Unauthenticated;
}

function isTestSeamAllowed(options: AgentAuthenticationOptions): boolean {
  if (options.allowTestSeam !== undefined) return options.allowTestSeam;
  return isVitestRuntime();
}

function isVitestRuntime(): boolean {
  const processLike = (
    globalThis as {
      readonly process?: { readonly env?: Readonly<Record<string, string | undefined>> };
    }
  ).process;
  return processLike?.env?.VITEST === 'true' || processLike?.env?.NODE_ENV === 'test';
}

function parsePrincipalType(rawType: string | null): AgentPrincipalType | undefined {
  const normalizedType = normalizeOptionalHeader(rawType);
  if (normalizedType === undefined) return undefined;
  if (
    normalizedType === 'CLIENT_SERVICE' ||
    normalizedType === 'INTEGRATION_INSTALLATION' ||
    normalizedType === 'INTERNAL_SERVICE' ||
    normalizedType === 'ADMIN_OPERATOR'
  ) {
    return normalizedType;
  }
  return undefined;
}

function parseScopes(rawScopes: string | null): readonly string[] {
  if (rawScopes === null || rawScopes.trim() === '') return [];
  return rawScopes
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope !== '');
}

function normalizeOptionalHeader(value: string | null): string | undefined {
  if (value === null || value.trim() === '') return undefined;
  return value.trim();
}
