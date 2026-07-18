'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../agent-rpc/agent-loader';
import { createManagedAgentRepository } from '../db';
import { getClientWorkerEnv } from '../env';

/**
 * Global / Agent settings 配下の Health Check Server Actions。
 *
 * @remarks
 * 選択済み Ed25519 signing key で `AgentHealthService.Check` を呼び、
 * trust config との一致と serving 状態を安全な形で UI に返す。
 * 認証失敗は通常の Check response ではなく Connect error として安全な message へ変換する。
 */

/**
 * Agent Health Check から得た公開 trust 診断情報 (browser-safe)。
 *
 * @remarks 公開識別子 (issuer/kid/fingerprint) と trust config の version/fingerprint/loadedAt だけを含む。
 * 秘密鍵 / JWT body / public key 全文は含まない。
 */
export interface BrowserSafeTrustDiagnostic {
  readonly trustConfigVersion?: string;
  readonly trustConfigFingerprint?: string;
  readonly trustConfigLoadedAtMs?: number;
  readonly trustConfigStatus?: string;
  readonly principalIssuer?: string;
  readonly principalKid?: string;
  readonly principalFingerprint?: string;
  readonly principalKeyStatus?: string;
  readonly principalVerified?: boolean;
  readonly verifiedAtUnixMs?: number;
}

/**
 * Agent Health Check action の browser-safe 結果。
 *
 * @remarks
 * 認証失敗や fingerprint 不一致は `ok: false` と安全な `safeMessage` になり、
 * 秘密情報や Connect error 本文を含めない。
 */
export interface BrowserSafeHealthVerificationResult {
  readonly ok: boolean;
  readonly agentId: string;
  readonly servingStatus?: string;
  readonly serviceVersion?: string;
  readonly lastVerifiedAtMs?: number;
  readonly diagnostic?: BrowserSafeTrustDiagnostic;
  readonly safeMessage?: string;
}

/**
 * 選択済み signing key で `AgentHealthService.Check` を呼び、結果を browser-safe に変換して返す。
 *
 * @param agentId - 検証対象の managed Agent ID。
 * @returns 公開 trust 診断と serving 状態をまとめた browser-safe 結果。
 * @remarks
 * 呼び出しは server-only で、選択済み Ed25519 signing key を署名 source にする。
 * 成功時 (`serving` / `degraded` かつ principal が trust config で検証済み) は
 * `signingLastVerifiedAtMs` を Client D1 へ更新し、selected-Agent pages の実データ表示へ繋げる。
 * 認証失敗 (unknown issuer/kid, revoked key, fingerprint mismatch, replayed jti) は
 * 通常の Check response ではなく安全な error message へ変換し、UI は接続不成立として扱う。
 */
export async function verifyAgentHealth(
  agentId: string
): Promise<BrowserSafeHealthVerificationResult> {
  if (agentId === '') {
    return { ok: false, agentId, safeMessage: 'Agent ID is required.' };
  }

  let loadResult;
  try {
    loadResult = await loadAgentRpcClients(agentId);
  } catch (error) {
    return { ok: false, agentId, safeMessage: safeSigningErrorMessage(error) };
  }
  const { clients } = loadResult;

  let response;
  try {
    response = await clients.withErrorNormalization(() =>
      clients.health.check({ agentId, includeDependencies: false })
    );
  } catch (error) {
    return { ok: false, agentId, safeMessage: safeSigningErrorMessage(error) };
  }

  const servingStatus = readString(response.status);
  const diagnostic = mapTrustDiagnostic(response);
  const verified =
    diagnostic?.principalVerified === true &&
    (servingStatus === 'serving' || servingStatus === 'degraded');

  if (!verified) {
    return {
      ok: false,
      agentId,
      servingStatus,
      serviceVersion: readString(response.serviceVersion),
      diagnostic,
      safeMessage: 'The Agent did not confirm the selected signing key against its trust config.',
    };
  }

  const verifiedAtMs = readBigIntMillis(response.checkedAtUnixMs) ?? Date.now();
  const env = getClientWorkerEnv();
  await createManagedAgentRepository(env.CLIENT_DB).markManagedAgentSigningVerified(
    agentId,
    verifiedAtMs
  );
  for (const segment of [
    '',
    'threads',
    'events',
    'runs',
    'schedules',
    'integrations',
    'settings',
  ]) {
    revalidatePath(segment === '' ? `/agents/${agentId}` : `/agents/${agentId}/${segment}`);
  }

  return {
    ok: true,
    agentId,
    servingStatus,
    serviceVersion: readString(response.serviceVersion),
    lastVerifiedAtMs: verifiedAtMs,
    diagnostic,
  };
}

/**
 * Agent Health Check response から公開 trust 診断情報だけを抽出する。
 *
 * @remarks 秘密情報・public key 全文・JWT body は一切含めない。
 */
function mapTrustDiagnostic(
  response: Record<string, unknown>
): BrowserSafeTrustDiagnostic | undefined {
  const trustConfig = readRecord(response.trustConfig);
  const principal = readRecord(response.currentPrincipalTrust);
  if (trustConfig === undefined && principal === undefined) {
    return undefined;
  }
  return {
    trustConfigVersion: readOptionalString(trustConfig?.version),
    trustConfigFingerprint: readOptionalString(trustConfig?.fingerprint),
    trustConfigLoadedAtMs: readBigIntMillis(trustConfig?.loadedAtUnixMs),
    trustConfigStatus: readOptionalString(trustConfig?.status),
    principalIssuer: readOptionalString(principal?.issuer),
    principalKid: readOptionalString(principal?.kid),
    principalFingerprint: readOptionalString(principal?.fingerprint),
    principalKeyStatus: readOptionalString(principal?.keyStatus),
    principalVerified: typeof principal?.verified === 'boolean' ? principal.verified : undefined,
    verifiedAtUnixMs: readBigIntMillis(principal?.verifiedAtUnixMs),
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readBigIntMillis(value: unknown): number | undefined {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function safeSigningErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    // Server Action 境界で既に browser-safe に正規化された AgentRpcOperationError を想定。
    // 秘密情報・stack trace は含まれないが、未知の error は安全側へ潰す。
    if (
      error.message.includes('signing key') ||
      error.message.includes('Acting user') ||
      error.message.includes('Agent RPC')
    ) {
      return error.message;
    }
  }
  return 'Agent health verification could not confirm the connection.';
}
