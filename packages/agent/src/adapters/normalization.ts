import { createAgentDomainError } from '../domain/errors';

import type { AgentPayloadMetadataView } from '../domain';

/**
 * Integration manifest から正規化した Adapter definition です。
 *
 * @remarks
 * 外部 platform 固有の webhook 名や payload 形式を Agent domain へ持ち込まず、
 * Agent が必要とする ingress grant、Delivery capability、schema 参照だけへ縮約します。
 *
 * @example
 * ```ts
 * const definition = normalizeAdapterDefinition({
 *   adapter_id: 'generic-adapter',
 *   display_name: 'Generic Adapter',
 *   ingress_grant: 'integration.ingress.event',
 * }, 'integration-1');
 * ```
 */
export interface NormalizedAdapterDefinition {
  readonly adapterId: string;
  readonly deliveryCapabilityId?: string;
  readonly displayName: string;
  readonly ingressGrant: string;
  readonly integrationId: string;
  readonly schemaRef?: string;
}

/**
 * Adapter Connection 作成時に Agent-local storage へ保存する正規化済み値です。
 *
 * @remarks
 * Connection key や外部 subject は任意の識別子として扱い、Provider 種別に依存する意味付けはしません。
 */
export interface NormalizedAdapterConnectionInput {
  readonly adapterId: string;
  readonly connectionKey?: string;
  readonly externalSubject?: string;
  readonly metadataRef?: string;
}

/**
 * Ingress から DeliveryContext を作るための正規化済み metadata です。
 *
 * @remarks
 * Provider が提示した DeliveryContext ID は採用せず、Agent 側で発行した ID と、
 * 事前に保存済みの Adapter/Connection 情報から capability を確定します。
 */
export interface NormalizedDeliveryContextInput {
  readonly capability: string;
  readonly expiresAtMs?: number;
  readonly metadataRef?: string;
}

/**
 * manifest 内の Adapter definition を Agent domain 用の汎用形に正規化します。
 *
 * @param value JSON manifest から取り出した未信頼の Adapter 値です。
 * @param integrationId Adapter が属する Integration ID です。
 * @returns Agent-owned storage へ保存できる Adapter definition です。
 * @throws AgentDomainError 必須 ID や ingress grant が欠ける場合に発生します。
 */
export function normalizeAdapterDefinition(
  value: unknown,
  integrationId: string
): NormalizedAdapterDefinition {
  const record = asRecord(value, 'adapter');
  const adapterId = requireText(record, ['adapter_id', 'adapterId'], 'adapter_id');
  const displayName = optionalText(record, ['display_name', 'displayName']) ?? adapterId;
  const ingressGrant = requireText(record, ['ingress_grant', 'ingressGrant'], 'ingress_grant');
  const deliveryCapabilityId = optionalText(record, [
    'delivery_capability_id',
    'deliveryCapabilityId',
  ]);
  const schemaRef = normalizeReference(record.schema_ref ?? record.schemaRef);
  return {
    adapterId,
    deliveryCapabilityId,
    displayName,
    ingressGrant,
    integrationId,
    schemaRef,
  };
}

/**
 * Adapter Connection request を未信頼文字列から Agent-local 値へ正規化します。
 *
 * @param input RPC request 由来の Adapter ID、Connection key、外部 subject、metadata 参照です。
 * @returns storage へ保存する Connection 入力です。
 * @throws AgentDomainError Adapter ID が空の場合に発生します。
 */
export function normalizeAdapterConnectionInput(input: {
  readonly adapterId: string;
  readonly connectionKey?: string;
  readonly externalSubject?: string;
  readonly metadataRef?: AgentPayloadMetadataView;
}): NormalizedAdapterConnectionInput {
  const adapterId = normalizeIdentity(input.adapterId, 'adapter_id');
  return {
    adapterId,
    connectionKey: normalizeOptionalText(input.connectionKey),
    externalSubject: normalizeOptionalText(input.externalSubject),
    metadataRef: input.metadataRef?.ref,
  };
}

/**
 * Ingress Event に含まれる Delivery metadata を Connection capability と照合して正規化します。
 *
 * @param input Provider が提示した Delivery metadata と保存済み Connection capability です。
 * @returns DeliveryContext を作る必要がある場合は正規化済み入力、不要なら `undefined` です。
 * @throws AgentDomainError Delivery metadata があるのに Connection が Delivery capability を持たない場合に発生します。
 */
export function normalizeDeliveryContextInput(input: {
  readonly connectionDeliveryCapabilityId?: string;
  readonly requestedCapability?: string;
  readonly requestedExpiresAtMs?: number;
  readonly requestedMetadataRef?: AgentPayloadMetadataView;
}): NormalizedDeliveryContextInput | undefined {
  const requestedCapability = normalizeOptionalText(input.requestedCapability);
  const capability =
    normalizeOptionalText(input.connectionDeliveryCapabilityId) ?? requestedCapability;
  const requestedDelivery =
    requestedCapability !== undefined ||
    input.requestedMetadataRef !== undefined ||
    input.requestedExpiresAtMs !== undefined;
  if (!requestedDelivery && capability === undefined) return undefined;
  if (capability === undefined) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Adapter Connection does not grant Delivery capability.',
      target: 'delivery_context',
    });
  }
  if (requestedCapability !== undefined && requestedCapability !== capability) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Requested Delivery capability does not match Adapter Connection.',
      target: 'delivery_context',
    });
  }
  return {
    capability,
    expiresAtMs: input.requestedExpiresAtMs,
    metadataRef: input.requestedMetadataRef?.ref,
  };
}

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createAgentDomainError({
      kind: 'validation',
      message: `Invalid ${target} object.`,
      target,
    });
  }
  return value as Record<string, unknown>;
}

function requireText(
  record: Readonly<Record<string, unknown>>,
  names: readonly string[],
  target: string
): string {
  const value = optionalText(record, names);
  if (value === undefined) {
    throw createAgentDomainError({
      kind: 'validation',
      message: `${target} must not be empty.`,
      target,
    });
  }
  return value;
}

function optionalText(
  record: Readonly<Record<string, unknown>>,
  names: readonly string[]
): string | undefined {
  for (const name of names) {
    const value = normalizeOptionalText(record[name]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeReference(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizeOptionalText(value);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return normalizeOptionalText((value as { readonly ref?: unknown }).ref);
}

function normalizeIdentity(value: string, target: string): string {
  const normalized = normalizeOptionalText(value);
  if (normalized === undefined) {
    throw createAgentDomainError({
      kind: 'validation',
      message: `${target} must not be empty.`,
      target,
    });
  }
  return normalized;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().normalize('NFC');
  return normalized === '' ? undefined : normalized;
}
