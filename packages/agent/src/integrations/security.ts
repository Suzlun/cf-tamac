import { createAgentDomainError } from '../domain/errors';
import { timingSafeEqualHex, verifyIntegrationDetachedSignature } from '../domain/security';

import type { AgentCoreRequestContext } from '../domain';
import type { AgentPrincipalContext, AgentRawBodyDigest } from '../domain/security';
import type { AgentStorageRepositories } from '../storage';
import type { IntegrationIngressSignatureInput } from './types';

/**
 * IntegrationIngressService の generated service 名です。
 */
export const integrationIngressServiceName = 'cftamac.agent.v1.IntegrationIngressService';

/**
 * Provider ingress が受け入れる timestamp の固定 window（milliseconds）です。
 *
 * Provider request が自己申告する `accepted_skew_ms` を信頼せず、署名の canonical timestamp と
 * Agent Worker の現在時刻との差がこの値以下の場合だけ次の verification 段階へ進めます。
 */
export const integrationIngressTimestampWindowMs = 300_000;

/**
 * Integration ingress の署名検証入力です。
 *
 * @property agentId 対象 Agent aggregate ID です。
 * @property connectionId Event callback における Adapter Connection ID です。
 * @property deliveryContextId Delivery callback で解決済みの DeliveryContext ID です。
 * @property idempotencyKey 同一 Provider command を識別する NFC 正規化済み key です。
 * @property installationId active trust key と grant owner を解決する Installation ID です。
 * @property invocationId Tool result callback の ToolInvocation ID です。
 * @property canonicalBodyDigest signature base に入れる unsigned raw Protobuf body digest です。
 * @property method Provider ingress の generated RPC method 名です。
 * @property repositories Agent-owned Durable Object storage repository set です。
 * @property signature Provider から受信した正規化済み detached signature metadata です。
 * @property toolId canonical signature base の optional tool ID です。
 */
export interface VerifyIntegrationIngressSignatureInput {
  readonly agentId: string;
  readonly connectionId?: string;
  readonly deliveryContextId?: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly invocationId?: string;
  readonly canonicalBodyDigest: AgentRawBodyDigest;
  readonly method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult';
  readonly repositories: AgentStorageRepositories;
  readonly signature: IntegrationIngressSignatureInput;
  readonly toolId?: string;
}

/**
 * Integration ingress request の detached signature、時刻、digest metadata を検証します。
 *
 * @param input Agent/Installation/Connection と RPC method に bind された署名検証入力です。
 * @returns active trust key で検証済みの `INTEGRATION_INSTALLATION` principal です。
 * @throws AgentDomainError 署名 metadata、active Installation/trust key、fixed timestamp window、digest、signature が不正な場合に発生します。Installation/key の存在・状態は単一の署名拒否として扱います。
 */
export async function verifyIntegrationIngressSignature(
  input: VerifyIntegrationIngressSignatureInput
): Promise<AgentPrincipalContext> {
  // 型 contract が Ed25519 以外を構築不能にするため、legacy symmetric algorithm を trust key resolver へ渡しません。
  const rawBodyDigest = normalizeRawBodyDigest(input.canonicalBodyDigest);
  if (
    !/^[0-9a-f]{64}$/u.test(input.signature.digestHex) ||
    !timingSafeEqualHex(input.signature.digestHex, rawBodyDigest.digestHex) ||
    input.signature.byteLength !== rawBodyDigest.byteLength
  ) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Raw body digest metadata is invalid.',
      target: 'raw_body_digest',
    });
  }
  const result = await verifyIntegrationDetachedSignature({
    acceptedSkewMs: integrationIngressTimestampWindowMs,
    // signature metadata の contract name `Ed25519` を domain crypto seam の WebCrypto/JWS algorithm 名 `EdDSA` へ明示変換します。
    algorithm: 'EdDSA',
    canonical: {
      agentId: input.agentId,
      connectionId: input.connectionId,
      deliveryContextId: input.deliveryContextId,
      idempotencyKey: input.idempotencyKey,
      installationId: input.installationId,
      invocationId: input.invocationId,
      method: input.method,
      nonce: input.signature.nonce,
      rawBodyDigest,
      service: integrationIngressServiceName,
      timestampUnixMs: input.signature.timestampMs,
      toolId: input.toolId,
    },
    keyId: input.signature.keyId,
    keyResolver: ({ installationId, keyId }) => {
      // Installation の存在・状態を先に外部へ返さず、active key 不在と同じ detached signature rejection に畳み込みます。
      const installation = input.repositories.integrations.findInstallation(installationId);
      if (installation?.status !== 'active') return undefined;
      const row = input.repositories.integrations.findActiveTrustKey({ installationId, keyId });
      if (row?.publicKeyMaterial === null || row?.publicKeyMaterial === undefined) return undefined;
      return { algorithm: 'EdDSA', key: parseKeyMaterial(row.publicKeyMaterial), keyId };
    },
    signature: input.signature.signature,
  });
  if (result.status === 'rejected') {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration ingress signature rejected.',
      safeDetails: { reason: result.reason },
      target: 'signature',
    });
  }
  // detached signature が成功した時点だけ canonical identity と鍵 ID に結び付く principal を次段へ渡します。
  return result.principal;
}

/**
 * 検証済み Provider principal を Agent command context に反映します。
 *
 * @param context dispatch が raw request metadata から作った、まだ最終認可に使えない context です。
 * @param principal active Installation trust key で検証済み principal です。
 * @returns final authorization、nonce/idempotency reservation、mutation に渡せる context です。
 * @throws AgentDomainError Agent/Installation identity が dispatch input と verification result で一致しない場合に発生します。
 * @example
 * ```ts
 * const verifiedContext = withVerifiedIntegrationIngressPrincipal(context, principal);
 * ```
 */
export function withVerifiedIntegrationIngressPrincipal(
  context: AgentCoreRequestContext,
  principal: AgentPrincipalContext
): AgentCoreRequestContext {
  // dispatch metadata と verified canonical identity が一致しない場合は、署名が有効でも別 aggregate への利用を拒否します。
  if (
    principal.principalType !== 'INTEGRATION_INSTALLATION' ||
    principal.agentId !== context.agentId ||
    principal.installationId !== context.principal.installationId
  ) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Verified Integration principal does not match ingress request identity.',
      target: 'installation_id',
    });
  }
  return { ...context, principal };
}

function normalizeRawBodyDigest(input: AgentRawBodyDigest): AgentRawBodyDigest {
  // canonical text は lowercase digest を要求するため、direct domain caller も表記を補正せず fail-closed にします。
  if (!/^[0-9a-f]{64}$/u.test(input.digestHex)) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Raw unsigned Protobuf body digest must be lowercase SHA-256 hex.',
      target: 'raw_body_digest',
    });
  }
  return {
    algorithm: 'sha-256',
    byteLength: input.byteLength,
    digestHex: input.digestHex,
  };
}

function parseKeyMaterial(value: string): JsonWebKey | string {
  try {
    return JSON.parse(value) as JsonWebKey;
  } catch {
    return value;
  }
}
