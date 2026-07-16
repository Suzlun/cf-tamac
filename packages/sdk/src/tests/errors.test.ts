import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { parseErrorCategory, TamacSdkOperationError, normalizeTamacSdkError } from '../errors';

import type { TamacSdkOperationContext } from '../errors';

describe('TAMAC SDK error normalization', () => {
  it('[TAMAC-SDK-S006] Permission denied が SDK normalized error として返る', () => {
    // scope 外の generated RPC が返した Connect permission_denied を secret-free operation context と結び付けます。
    const permissionDenied = normalizeTamacSdkError(
      new ConnectError('scope token must not leak', Code.PermissionDenied),
      createOperationContext()
    );
    // stable category と raw message を含まない safe detail が consumer UI/log の分岐に使えることを検査します。
    expect(permissionDenied).toBeInstanceOf(TamacSdkOperationError);
    expect(permissionDenied).toMatchObject({
      agentId: 'agent-alpha',
      category: 'permission_denied',
      connectCode: Code.PermissionDenied,
      correlationId: 'correlation-001',
      idempotencyKey: 'idempotency-001',
      methodName: 'ApproveInvocation',
      requestId: 'request-001',
      serviceName: 'cftamac.agent.v1.AgentToolService',
    });
    expect(permissionDenied.safeDetail).not.toContain('scope token');

    // concurrent state change が返す aborted code も retry policy 用の独立した stable category に写像します。
    const aborted = normalizeTamacSdkError(
      new ConnectError('concurrent state changed', Code.Aborted),
      createOperationContext()
    );
    expect(aborted.category).toBe('aborted');
    expect(aborted.connectCode).toBe(Code.Aborted);
    expect(aborted.safeDetail).not.toContain('concurrent state changed');
  });

  it('[TAMAC-SDK-S002] Provider rate limit code を resource_exhausted category へ変換する', () => {
    // Provider ingress safe 429 に対応する Connect code が closed category へ一意に写像されることを検査します。
    expect(parseErrorCategory(Code.ResourceExhausted)).toBe('resource_exhausted');
  });
});

function createOperationContext(): TamacSdkOperationContext {
  // error normalizer が request/Agent/correlation/idempotency を失わない fixture を返します。
  return {
    agentId: 'agent-alpha',
    correlationId: 'correlation-001',
    idempotencyKey: 'idempotency-001',
    methodContext: {
      methodName: 'ApproveInvocation',
      serviceName: 'cftamac.agent.v1.AgentToolService',
    },
    requestId: 'request-001',
  };
}
